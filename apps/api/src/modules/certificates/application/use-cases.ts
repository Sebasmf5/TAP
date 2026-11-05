import type {
  CertificateDto,
  CertificateTemplateDto,
  CreateCertificateTemplateRequest,
  EligibilityEvaluationItem,
  EvaluateEventCertificatesResponse,
  IssueEventCertificatesRequest,
  IssueEventCertificatesResponse,
  PreviewCertificateTemplateRequest,
  PublicCertificateVerificationResponse,
  RevokeCertificateRequest,
  UpdateCertificateTemplateRequest,
} from '@tap/contracts';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type AuditLog,
  type Clock,
  type EventBus,
  type FileStorage,
  type IdGenerator,
  type TenantContext,
} from '../../../shared/index.ts';
import type { AttendanceRecord } from '../../attendance/index.ts';

type StaffActor = TenantContext;
import type { EventEntity } from '../../events/index.ts';
import type { Organization } from '../../organizations/index.ts';
import type { Person } from '../../people/index.ts';
import { maskDocumentNumber } from '../../people/index.ts';
import {
  createEligibilityStrategy,
  generateCertificateCode,
  interpolateCertificateVariables,
  type CertificateEntity,
  type CertificateTemplateEntity,
  type CertificateTemplateSnapshot,
} from '../domain/entities.ts';
import type { CertificatePdfRenderer, CertificatesRepository } from '../domain/ports.ts';

function assertStaffOrganization(actor: StaffActor): string {
  if (!actor.organizationId) {
    throw new ForbiddenError('Esta operación requiere pertenecer a una entidad activa.');
  }
  return actor.organizationId;
}

function assertOperatorOrAdmin(actor: StaffActor): string {
  const orgId = assertStaffOrganization(actor);
  if (actor.role !== 'org_admin' && actor.role !== 'operator') {
    throw new ForbiddenError(
      'Solo administradores u operadores pueden gestionar plantillas o emitir certificados.',
    );
  }
  return orgId;
}

function formatBogotaDateLong(date: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function toTemplateDto(entity: CertificateTemplateEntity): CertificateTemplateDto {
  return {
    id: entity.id,
    organizationId: entity.organizationId,
    title: entity.title,
    bodyTemplate: entity.bodyTemplate,
    logoUrl: entity.logoUrl,
    signers: entity.signers,
    orientation: entity.orientation,
    version: entity.version,
    isDefault: entity.isDefault,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toCertificateDto(entity: CertificateEntity): CertificateDto {
  return {
    id: entity.id,
    organizationId: entity.organizationId,
    eventId: entity.eventId,
    personId: entity.personId,
    templateId: entity.templateId,
    code: entity.code,
    status: entity.status,
    holderName: entity.templateSnapshot.holderName,
    maskedDocument: entity.templateSnapshot.maskedDocument,
    recipientEmail: entity.templateSnapshot.recipientEmail,
    eventName: entity.templateSnapshot.eventName,
    eventDate: entity.templateSnapshot.eventDate,
    hours: entity.templateSnapshot.hours,
    pdfSha256: entity.pdfSha256,
    issuedAt: entity.issuedAt.toISOString(),
    deliveredAt: entity.deliveredAt ? entity.deliveredAt.toISOString() : null,
    revokedAt: entity.revokedAt ? entity.revokedAt.toISOString() : null,
    revokedReason: entity.revokedReason,
    verificationCount: entity.verificationCount,
  };
}

export class CertificatesService {
  private readonly repository: CertificatesRepository;
  private readonly pdfRenderer: CertificatePdfRenderer;
  private readonly fileStorage: FileStorage;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly eventBus: EventBus;
  private readonly auditLog: AuditLog;
  private readonly appUrl: string;
  private readonly findEventById: (
    organizationId: string,
    eventId: string,
  ) => Promise<EventEntity | null>;
  private readonly findOrganizationById: (organizationId: string) => Promise<Organization | null>;
  private readonly assertFeatureEnabled: (
    organizationId: string,
    feature: 'certificates',
  ) => Promise<void>;
  private readonly listValidAttendanceByEvent: (
    organizationId: string,
    eventId: string,
  ) => Promise<AttendanceRecord[]>;
  private readonly findPersonById: (
    organizationId: string,
    personId: string,
  ) => Promise<Person | null>;
  private readonly enqueueResendNotification?: (params: {
    organizationId: string;
    certificate: CertificateEntity;
    verificationUrl: string;
  }) => Promise<void>;

  public constructor(deps: {
    repository: CertificatesRepository;
    pdfRenderer: CertificatePdfRenderer;
    fileStorage: FileStorage;
    idGenerator: IdGenerator;
    clock: Clock;
    eventBus: EventBus;
    auditLog: AuditLog;
    appUrl: string;
    findEventById: (organizationId: string, eventId: string) => Promise<EventEntity | null>;
    findOrganizationById: (organizationId: string) => Promise<Organization | null>;
    assertFeatureEnabled: (organizationId: string, feature: 'certificates') => Promise<void>;
    listValidAttendanceByEvent: (
      organizationId: string,
      eventId: string,
    ) => Promise<AttendanceRecord[]>;
    findPersonById: (organizationId: string, personId: string) => Promise<Person | null>;
    enqueueResendNotification?: (params: {
      organizationId: string;
      certificate: CertificateEntity;
      verificationUrl: string;
    }) => Promise<void>;
  }) {
    this.repository = deps.repository;
    this.pdfRenderer = deps.pdfRenderer;
    this.fileStorage = deps.fileStorage;
    this.idGenerator = deps.idGenerator;
    this.clock = deps.clock;
    this.eventBus = deps.eventBus;
    this.auditLog = deps.auditLog;
    this.appUrl = deps.appUrl.replace(/\/+$/, '');
    this.findEventById = deps.findEventById;
    this.findOrganizationById = deps.findOrganizationById;
    this.assertFeatureEnabled = deps.assertFeatureEnabled;
    this.listValidAttendanceByEvent = deps.listValidAttendanceByEvent;
    this.findPersonById = deps.findPersonById;
    this.enqueueResendNotification = deps.enqueueResendNotification;
  }

  public async ensureDefaultTemplate(organizationId: string): Promise<CertificateTemplateEntity> {
    const existing = await this.repository.findDefaultTemplate(organizationId);
    if (existing) {
      return existing;
    }

    const now = this.clock.now();
    return this.repository.createTemplate({
      id: this.idGenerator.nextId(),
      organizationId,
      title: 'Certificado de Participación',
      bodyTemplate:
        'Certifica que {{full_name}} participó activamente en la actividad institucional «{{event_name}}», realizada el {{date}}, con una intensidad horaria de {{hours}} hora(s).',
      logoUrl: null,
      signers: [
        {
          name: 'Dirección de Bienestar Institucional',
          role: 'Coordinación General',
        },
      ],
      orientation: 'landscape',
      version: 1,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  public async listTemplates(actor: StaffActor): Promise<CertificateTemplateDto[]> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'certificates');
    await this.ensureDefaultTemplate(orgId);
    const list = await this.repository.listTemplates(orgId);
    return list.map(toTemplateDto);
  }

  public async createTemplate(
    actor: StaffActor,
    input: CreateCertificateTemplateRequest,
  ): Promise<CertificateTemplateDto> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'certificates');

    if (input.isDefault) {
      await this.repository.clearDefaultTemplates(orgId);
    }

    const now = this.clock.now();
    const created = await this.repository.createTemplate({
      id: this.idGenerator.nextId(),
      organizationId: orgId,
      title: input.title,
      bodyTemplate: input.bodyTemplate,
      logoUrl: input.logoUrl ?? null,
      signers: input.signers,
      orientation: input.orientation,
      version: 1,
      isDefault: input.isDefault,
      createdAt: now,
      updatedAt: now,
    });

    await this.auditLog.record({
      organizationId: orgId,
      actorUserId: actor.userId,
      action: 'certificate_template.created',
      targetType: 'certificate_template',
      targetId: created.id,
      metadata: { title: created.title, version: created.version },
    });

    return toTemplateDto(created);
  }

  public async updateTemplate(
    actor: StaffActor,
    templateId: string,
    input: UpdateCertificateTemplateRequest,
  ): Promise<CertificateTemplateDto> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'certificates');

    const existing = await this.repository.findTemplateById(orgId, templateId);
    if (!existing) {
      throw new NotFoundError('No se encontró la plantilla de certificado.');
    }

    if (input.isDefault) {
      await this.repository.clearDefaultTemplates(orgId);
    }

    const updated = await this.repository.updateTemplate({
      ...existing,
      title: input.title ?? existing.title,
      bodyTemplate: input.bodyTemplate ?? existing.bodyTemplate,
      logoUrl: input.logoUrl !== undefined ? input.logoUrl : existing.logoUrl,
      signers: input.signers ?? existing.signers,
      orientation: input.orientation ?? existing.orientation,
      isDefault: input.isDefault ?? existing.isDefault,
      version: existing.version + 1,
      updatedAt: this.clock.now(),
    });

    await this.auditLog.record({
      organizationId: orgId,
      actorUserId: actor.userId,
      action: 'certificate_template.updated',
      targetType: 'certificate_template',
      targetId: updated.id,
      metadata: { title: updated.title, version: updated.version },
    });

    return toTemplateDto(updated);
  }

  public async previewTemplatePdf(
    actor: StaffActor,
    templateId: string,
    input: PreviewCertificateTemplateRequest,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'certificates');

    const template = await this.repository.findTemplateById(orgId, templateId);
    if (!template) {
      throw new NotFoundError('No se encontró la plantilla de certificado.');
    }

    const org = await this.findOrganizationById(orgId);
    const organizationName = org?.name ?? 'Entidad Institucional';

    const bodyText = interpolateCertificateVariables(template.bodyTemplate, {
      full_name: input.sampleFullName,
      event_name: input.sampleEventName,
      date: input.sampleDate,
      hours: input.sampleHours,
    });

    const sampleCode = 'DEMO23456789';
    const snapshot: CertificateTemplateSnapshot = {
      title: template.title,
      bodyText,
      holderName: input.sampleFullName,
      maskedDocument: '•••0000',
      recipientEmail: null,
      eventName: input.sampleEventName,
      eventDate: input.sampleDate,
      hours: input.sampleHours,
      organizationName,
      signers: template.signers,
      orientation: template.orientation,
      version: template.version,
    };

    const { pdfBuffer } = await this.pdfRenderer.renderCertificatePdf({
      code: sampleCode,
      verificationUrl: `${this.appUrl}/v/${sampleCode}`,
      snapshot,
      issuedAt: this.clock.now(),
    });

    return {
      buffer: pdfBuffer,
      filename: `vista_previa_certificado_v${template.version}.pdf`,
    };
  }

  public async evaluateEventEligibility(
    actor: StaffActor,
    eventId: string,
  ): Promise<EvaluateEventCertificatesResponse> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'certificates');
    return this.evaluateEventEligibilityInternal(orgId, eventId);
  }

  public async evaluateEventEligibilityInternal(
    organizationId: string,
    eventId: string,
  ): Promise<EvaluateEventCertificatesResponse> {
    const event = await this.findEventById(organizationId, eventId);
    if (!event) {
      throw new NotFoundError('No se encontró el evento solicitado.');
    }

    const strategy = createEligibilityStrategy(event.certificateRule);
    const totalSessions = Math.max(1, event.sessions.length);

    const [validRecords, existingCerts] = await Promise.all([
      this.listValidAttendanceByEvent(organizationId, eventId),
      this.repository.listByEvent(organizationId, eventId),
    ]);

    const activeCertByPerson = new Map<string, CertificateEntity>();
    for (const cert of existingCerts) {
      if (cert.status === 'issued') {
        activeCertByPerson.set(cert.personId, cert);
      }
    }

    const sessionsByPerson = new Map<string, Set<string>>();
    for (const record of validRecords) {
      let set = sessionsByPerson.get(record.personId);
      if (!set) {
        set = new Set<string>();
        sessionsByPerson.set(record.personId, set);
      }
      set.add(record.sessionId);
    }

    const eligible: EligibilityEvaluationItem[] = [];
    const ineligible: EligibilityEvaluationItem[] = [];
    let alreadyIssuedCount = 0;

    for (const [personId, sessionSet] of sessionsByPerson.entries()) {
      const person = await this.findPersonById(organizationId, personId);
      if (!person) continue;

      const attendedSessions = sessionSet.size;
      const evalResult = strategy.evaluate({ attendedSessions, totalSessions });
      const activeCert = activeCertByPerson.get(personId);
      if (activeCert) {
        alreadyIssuedCount += 1;
      }

      const item: EligibilityEvaluationItem = {
        personId,
        fullName: person.fullName,
        maskedDocument: maskDocumentNumber(person.documentNumber),
        email: person.email,
        attendedSessions,
        totalSessions,
        attendancePercent: evalResult.attendancePercent,
        eligible: evalResult.eligible,
        reason: evalResult.reason,
        alreadyIssued: Boolean(activeCert),
        certificateId: activeCert?.id ?? null,
        certificateCode: activeCert?.code ?? null,
      };

      if (evalResult.eligible) {
        eligible.push(item);
      } else {
        ineligible.push(item);
      }
    }

    eligible.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es-CO'));
    ineligible.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es-CO'));

    return {
      eventId: event.id,
      eventName: event.name,
      ruleSummary: strategy.ruleSummary,
      totalEvaluated: eligible.length + ineligible.length,
      eligibleCount: eligible.length,
      ineligibleCount: ineligible.length,
      alreadyIssuedCount,
      eligible,
      ineligible,
    };
  }

  public async issueEventCertificates(
    actor: StaffActor,
    eventId: string,
    input: IssueEventCertificatesRequest,
  ): Promise<IssueEventCertificatesResponse> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'certificates');
    return this.issueEventCertificatesInternal({
      organizationId: orgId,
      actorUserId: actor.userId,
      eventId,
      input,
    });
  }

  public async issueEventCertificatesInternal(params: {
    organizationId: string;
    actorUserId: string | null;
    eventId: string;
    input: IssueEventCertificatesRequest;
  }): Promise<IssueEventCertificatesResponse> {
    const event = await this.findEventById(params.organizationId, params.eventId);
    if (!event) {
      throw new NotFoundError('No se encontró el evento solicitado.');
    }

    const org = await this.findOrganizationById(params.organizationId);
    const organizationName = org?.name ?? 'Entidad Institucional';

    let template: CertificateTemplateEntity;
    if (params.input.templateId) {
      const foundTemplate = await this.repository.findTemplateById(
        params.organizationId,
        params.input.templateId,
      );
      if (!foundTemplate) {
        throw new NotFoundError('No se encontró la plantilla de certificado seleccionada.');
      }
      template = foundTemplate;
    } else {
      template = await this.ensureDefaultTemplate(params.organizationId);
    }

    const evaluation = await this.evaluateEventEligibilityInternal(
      params.organizationId,
      params.eventId,
    );

    const filterIds =
      params.input.personIds && params.input.personIds.length > 0
        ? new Set(params.input.personIds)
        : null;

    const targetEligible = filterIds
      ? evaluation.eligible.filter((item) => filterIds.has(item.personId))
      : evaluation.eligible;

    const eventDateStr = formatBogotaDateLong(event.startsAt);
    const hours = params.input.hours || '4';
    const now = this.clock.now();

    let issuedCount = 0;
    let skippedAlreadyIssuedCount = 0;
    const processedCertificates: CertificateDto[] = [];

    for (const candidate of targetEligible) {
      const bodyText = interpolateCertificateVariables(template.bodyTemplate, {
        full_name: candidate.fullName,
        event_name: event.name,
        date: eventDateStr,
        hours,
      });

      const snapshot: CertificateTemplateSnapshot = {
        title: template.title,
        bodyText,
        holderName: candidate.fullName,
        maskedDocument: candidate.maskedDocument,
        recipientEmail: candidate.email,
        eventName: event.name,
        eventDate: eventDateStr,
        hours,
        organizationName,
        signers: template.signers,
        orientation: template.orientation,
        version: template.version,
      };

      const candidateCode = generateCertificateCode();
      const { created, certificate } = await this.repository.insertCertificateIfNotIssued({
        id: this.idGenerator.nextId(),
        organizationId: params.organizationId,
        eventId: event.id,
        personId: candidate.personId,
        templateId: template.id,
        code: candidateCode,
        templateSnapshot: snapshot,
        pdfPath: null,
        pdfSha256: null,
        issuedAt: now,
      });

      if (!created) {
        skippedAlreadyIssuedCount += 1;
        processedCertificates.push(toCertificateDto(certificate));
        continue;
      }

      issuedCount += 1;
      const verificationUrl = `${this.appUrl}/v/${certificate.code}`;
      const { pdfBuffer, sha256 } = await this.pdfRenderer.renderCertificatePdf({
        code: certificate.code,
        verificationUrl,
        snapshot,
        issuedAt: certificate.issuedAt,
      });

      const relativePath = `certificates/${params.organizationId}/${event.id}/${certificate.code}.pdf`;
      await this.fileStorage.put(relativePath, pdfBuffer);

      const updatedCert =
        (await this.repository.updateCertificatePdf(
          params.organizationId,
          certificate.id,
          relativePath,
          sha256,
        )) ?? certificate;

      await this.eventBus.publish({
        id: this.idGenerator.nextId(),
        name: 'certificate.issued',
        organizationId: params.organizationId,
        occurredAt: now,
        payload: {
          organizationId: params.organizationId,
          certificateId: updatedCert.id,
          certificateCode: updatedCert.code,
          eventId: event.id,
          eventName: event.name,
          personId: candidate.personId,
          holderName: candidate.fullName,
          recipientEmail: candidate.email,
          hours,
          organizationName,
          verificationUrl,
        },
      });

      const refreshed =
        (await this.repository.findById(params.organizationId, updatedCert.id)) ?? updatedCert;
      processedCertificates.push(toCertificateDto(refreshed));
    }

    if (issuedCount > 0) {
      await this.auditLog.record({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: 'certificates.batch_issued',
        targetType: 'event',
        targetId: event.id,
        metadata: {
          issuedCount,
          skippedAlreadyIssuedCount,
          templateId: template.id,
        },
      });
    }

    return {
      eventId: event.id,
      issuedCount,
      skippedAlreadyIssuedCount,
      ineligibleCount: evaluation.ineligibleCount,
      certificates: processedCertificates,
    };
  }

  public async listEventCertificates(
    actor: StaffActor,
    eventId: string,
  ): Promise<CertificateDto[]> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'certificates');

    const event = await this.findEventById(orgId, eventId);
    if (!event) {
      throw new NotFoundError('No se encontró el evento solicitado.');
    }

    const list = await this.repository.listByEvent(orgId, eventId);
    return list.map(toCertificateDto);
  }

  public async listEventCertificatesInternal(
    organizationId: string,
    eventId: string,
  ): Promise<CertificateDto[]> {
    const list = await this.repository.listByEvent(organizationId, eventId);
    return list.map(toCertificateDto);
  }

  public async downloadCertificatePdf(
    actor: StaffActor,
    certificateId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'certificates');

    const cert = await this.repository.findById(orgId, certificateId);
    if (!cert) {
      throw new NotFoundError('No se encontró el certificado solicitado.');
    }

    if (cert.pdfPath && (await this.fileStorage.exists(cert.pdfPath))) {
      const buffer = await this.fileStorage.get(cert.pdfPath);
      return {
        buffer,
        filename: `certificado_${cert.code}.pdf`,
      };
    }

    const verificationUrl = `${this.appUrl}/v/${cert.code}`;
    const { pdfBuffer, sha256 } = await this.pdfRenderer.renderCertificatePdf({
      code: cert.code,
      verificationUrl,
      snapshot: cert.templateSnapshot,
      issuedAt: cert.issuedAt,
    });

    const relativePath = `certificates/${orgId}/${cert.eventId}/${cert.code}.pdf`;
    await this.fileStorage.put(relativePath, pdfBuffer);
    await this.repository.updateCertificatePdf(orgId, cert.id, relativePath, sha256);

    return {
      buffer: pdfBuffer,
      filename: `certificado_${cert.code}.pdf`,
    };
  }

  public async revokeCertificate(
    actor: StaffActor,
    certificateId: string,
    input: RevokeCertificateRequest,
  ): Promise<CertificateDto> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'certificates');

    const existing = await this.repository.findById(orgId, certificateId);
    if (!existing) {
      throw new NotFoundError('No se encontró el certificado solicitado.');
    }

    if (existing.status === 'revoked') {
      throw new ConflictError('Este certificado ya fue revocado anteriormente.');
    }

    const now = this.clock.now();
    const revoked = await this.repository.revokeCertificate({
      organizationId: orgId,
      certificateId,
      revokedAt: now,
      revokedByUserId: actor.userId,
      reason: input.reason,
    });

    if (!revoked) {
      throw new NotFoundError('No se pudo revocar el certificado.');
    }

    await this.auditLog.record({
      organizationId: orgId,
      actorUserId: actor.userId,
      action: 'certificate.revoked',
      targetType: 'certificate',
      targetId: revoked.id,
      metadata: {
        code: revoked.code,
        eventId: revoked.eventId,
        reason: input.reason,
      },
    });

    await this.eventBus.publish({
      id: this.idGenerator.nextId(),
      name: 'certificate.revoked',
      organizationId: orgId,
      occurredAt: now,
      payload: {
        certificateId: revoked.id,
        code: revoked.code,
        reason: input.reason,
      },
    });

    return toCertificateDto(revoked);
  }

  public async resendCertificate(
    actor: StaffActor,
    certificateId: string,
  ): Promise<CertificateDto> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'certificates');

    const existing = await this.repository.findById(orgId, certificateId);
    if (!existing) {
      throw new NotFoundError('No se encontró el certificado solicitado.');
    }

    if (existing.status === 'revoked') {
      throw new ConflictError('No se puede reenviar un certificado revocado.');
    }

    if (this.enqueueResendNotification && existing.templateSnapshot.recipientEmail) {
      await this.enqueueResendNotification({
        organizationId: orgId,
        certificate: existing,
        verificationUrl: `${this.appUrl}/v/${existing.code}`,
      });
    }

    const refreshed = (await this.repository.findById(orgId, certificateId)) ?? existing;
    return toCertificateDto(refreshed);
  }

  public async verifyCertificatePublic(
    rawCode: string,
  ): Promise<PublicCertificateVerificationResponse> {
    const normalized = rawCode.trim().toUpperCase();
    const cert = await this.repository.findByCodePublic(normalized);

    if (!cert) {
      return {
        found: false,
        status: 'not_found',
        code: normalized,
        holderName: null,
        eventName: null,
        eventDate: null,
        hours: null,
        organizationName: null,
        issuedAt: null,
        pdfSha256: null,
        revokedAt: null,
        revokedReason: null,
      };
    }

    await this.repository.incrementVerificationCount(cert.id);

    return {
      found: true,
      status: cert.status === 'revoked' ? 'revoked' : 'valid',
      code: cert.code,
      holderName: cert.templateSnapshot.holderName,
      eventName: cert.templateSnapshot.eventName,
      eventDate: cert.templateSnapshot.eventDate,
      hours: cert.templateSnapshot.hours,
      organizationName: cert.templateSnapshot.organizationName,
      issuedAt: cert.issuedAt.toISOString(),
      pdfSha256: cert.pdfSha256,
      revokedAt: cert.revokedAt ? cert.revokedAt.toISOString() : null,
      revokedReason: cert.revokedReason,
    };
  }
}
