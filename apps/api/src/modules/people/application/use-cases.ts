import type {
  ConsentChannel,
  CreatePersonRequest,
  DocumentType,
  ImportPeopleRequest,
  ImportPeopleResponse,
  ImportPreviewRow,
  PersonDto,
  PersonType,
  UpdatePersonRequest,
} from '@tap/contracts';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  generatePublicCode,
  requireOrganizationId,
  type AuditLog,
  type Clock,
  type IdGenerator,
  type TenantContext,
} from '../../../shared/index.ts';
import {
  parseCsvPeople,
  toPersonDto,
  validateMinorGuardian,
  type DataConsent,
  type Person,
} from '../domain/entities.ts';
import type { PeopleRepository } from '../domain/ports.ts';

function ensureCanWritePeople(ctx: TenantContext): string {
  if (ctx.role !== 'org_admin' && ctx.role !== 'operator') {
    throw new ForbiddenError('No tienes permisos para registrar o modificar participantes.');
  }
  return requireOrganizationId(ctx);
}

export class PeopleService {
  private readonly repository: PeopleRepository;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly auditLog: AuditLog;

  constructor(params: {
    repository: PeopleRepository;
    idGenerator: IdGenerator;
    clock: Clock;
    auditLog: AuditLog;
  }) {
    this.repository = params.repository;
    this.idGenerator = params.idGenerator;
    this.clock = params.clock;
    this.auditLog = params.auditLog;
  }

  async listPeople(ctx: TenantContext, query?: string): Promise<PersonDto[]> {
    const organizationId = requireOrganizationId(ctx);
    const people = await this.repository.searchByOrganization(organizationId, query);
    const maskSensitive = ctx.role === 'viewer';

    const results: PersonDto[] = [];
    for (const person of people) {
      const latestConsent = await this.repository.findLatestConsent(organizationId, person.id);
      results.push(toPersonDto(person, { maskSensitive, latestConsent }));
    }
    return results;
  }

  async getPersonById(ctx: TenantContext, personId: string): Promise<PersonDto> {
    const organizationId = requireOrganizationId(ctx);
    const person = await this.repository.findById(organizationId, personId);
    if (!person) {
      throw new NotFoundError('La persona solicitada no existe en tu entidad.');
    }
    const latestConsent = await this.repository.findLatestConsent(organizationId, person.id);
    return toPersonDto(person, {
      maskSensitive: ctx.role === 'viewer',
      latestConsent,
    });
  }

  async createPerson(
    ctx: TenantContext,
    input: CreatePersonRequest,
    ipHash?: string | null,
  ): Promise<PersonDto> {
    const organizationId = ensureCanWritePeople(ctx);

    const docNumber = input.documentNumber.trim();
    const existing = await this.repository.findByDocument(
      organizationId,
      docNumber,
      input.documentType,
    );
    if (existing) {
      throw new ConflictError(
        `Ya existe una persona registrada con el documento ${input.documentType} ${docNumber}.`,
      );
    }

    validateMinorGuardian({
      isMinor: input.isMinor,
      guardianName: input.guardianName,
      guardianPhone: input.guardianPhone,
    });

    const now = this.clock.now();
    const person: Person = {
      id: this.idGenerator.nextId(),
      organizationId,
      documentType: input.documentType,
      documentNumber: docNumber,
      institutionalCode: input.institutionalCode?.trim() || null,
      fullName: input.fullName.trim(),
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
      personType: input.personType,
      isMinor: input.isMinor,
      guardianName: input.guardianName?.trim() || null,
      guardianDocument: input.guardianDocument?.trim() || null,
      guardianPhone: input.guardianPhone?.trim() || null,
      qrToken: generatePublicCode(12),
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.create(person);

    let latestConsent: DataConsent | null = null;
    if (input.consentAccepted) {
      latestConsent = {
        id: this.idGenerator.nextId(),
        organizationId,
        personId: person.id,
        version: input.consentVersion?.trim() || 'v1.0',
        acceptedAt: now,
        channel: 'staff_assisted',
        ipHash: ipHash ?? null,
      };
      await this.repository.recordConsent(latestConsent);
    }

    await this.auditLog.record({
      organizationId,
      actorUserId: ctx.userId,
      action: 'person.created',
      targetType: 'person',
      targetId: person.id,
      metadata: {
        personType: person.personType,
        isMinor: person.isMinor,
      },
    });

    return toPersonDto(person, { latestConsent });
  }

  async updatePerson(
    ctx: TenantContext,
    personId: string,
    input: UpdatePersonRequest,
  ): Promise<PersonDto> {
    const organizationId = ensureCanWritePeople(ctx);
    const existing = await this.repository.findById(organizationId, personId);
    if (!existing) {
      throw new NotFoundError('La persona solicitada no existe en tu entidad.');
    }

    const nextIsMinor = input.isMinor ?? existing.isMinor;
    const nextGuardianName =
      input.guardianName !== undefined ? input.guardianName : existing.guardianName;
    const nextGuardianPhone =
      input.guardianPhone !== undefined ? input.guardianPhone : existing.guardianPhone;

    validateMinorGuardian({
      isMinor: nextIsMinor,
      guardianName: nextGuardianName,
      guardianPhone: nextGuardianPhone,
    });

    const updated: Person = {
      ...existing,
      institutionalCode:
        input.institutionalCode !== undefined
          ? input.institutionalCode?.trim() || null
          : existing.institutionalCode,
      fullName: input.fullName ? input.fullName.trim() : existing.fullName,
      email: input.email !== undefined ? input.email?.trim().toLowerCase() || null : existing.email,
      phone: input.phone !== undefined ? input.phone?.trim() || null : existing.phone,
      personType: input.personType ?? existing.personType,
      isMinor: nextIsMinor,
      guardianName: nextGuardianName?.trim() || null,
      guardianDocument:
        input.guardianDocument !== undefined
          ? input.guardianDocument?.trim() || null
          : existing.guardianDocument,
      guardianPhone: nextGuardianPhone?.trim() || null,
      updatedAt: this.clock.now(),
    };

    await this.repository.update(updated);
    const latestConsent = await this.repository.findLatestConsent(organizationId, updated.id);
    return toPersonDto(updated, { latestConsent });
  }

  async rotateQrToken(ctx: TenantContext, personId: string): Promise<PersonDto> {
    const organizationId = ensureCanWritePeople(ctx);
    const existing = await this.repository.findById(organizationId, personId);
    if (!existing) {
      throw new NotFoundError('La persona solicitada no existe en tu entidad.');
    }

    const updated: Person = {
      ...existing,
      qrToken: generatePublicCode(12),
      updatedAt: this.clock.now(),
    };
    await this.repository.update(updated);

    await this.auditLog.record({
      organizationId,
      actorUserId: ctx.userId,
      action: 'person.qr_rotated',
      targetType: 'person',
      targetId: updated.id,
    });

    const latestConsent = await this.repository.findLatestConsent(organizationId, updated.id);
    return toPersonDto(updated, { latestConsent });
  }

  /**
   * Importa personas por CSV con vista previa (`dryRun: true`) y reporte de errores fila por fila.
   * Cuando `dryRun: false`, realiza upsert por `(organization_id, document_type, document_number)`
   * sobre las filas válidas.
   */
  async importPeopleCsv(
    ctx: TenantContext,
    input: ImportPeopleRequest,
  ): Promise<ImportPeopleResponse> {
    const organizationId = ensureCanWritePeople(ctx);
    const parsed = parseCsvPeople(input.csvContent);

    const preview: ImportPreviewRow[] = [];
    let createdCount = 0;
    let updatedCount = 0;
    const now = this.clock.now();

    for (const row of parsed.validRows) {
      const existing = await this.repository.findByDocument(
        organizationId,
        row.documentNumber,
        row.documentType,
      );
      const action = existing ? ('update' as const) : ('create' as const);

      preview.push({
        rowNumber: row.rowNumber,
        action,
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        institutionalCode: row.institutionalCode,
        fullName: row.fullName,
        email: row.email,
        personType: row.personType,
        isMinor: row.isMinor,
      });

      if (!input.dryRun) {
        if (existing) {
          await this.repository.update({
            ...existing,
            institutionalCode: row.institutionalCode ?? existing.institutionalCode,
            fullName: row.fullName,
            email: row.email ?? existing.email,
            phone: row.phone ?? existing.phone,
            personType: row.personType,
            isMinor: row.isMinor,
            guardianName: row.guardianName ?? existing.guardianName,
            guardianDocument: row.guardianDocument ?? existing.guardianDocument,
            guardianPhone: row.guardianPhone ?? existing.guardianPhone,
            updatedAt: now,
          });
          updatedCount += 1;
        } else {
          await this.repository.create({
            id: this.idGenerator.nextId(),
            organizationId,
            documentType: row.documentType,
            documentNumber: row.documentNumber,
            institutionalCode: row.institutionalCode,
            fullName: row.fullName,
            email: row.email,
            phone: row.phone,
            personType: row.personType,
            isMinor: row.isMinor,
            guardianName: row.guardianName,
            guardianDocument: row.guardianDocument,
            guardianPhone: row.guardianPhone,
            qrToken: generatePublicCode(12),
            createdAt: now,
            updatedAt: now,
          });
          createdCount += 1;
        }
      }
    }

    if (!input.dryRun && (createdCount > 0 || updatedCount > 0)) {
      await this.auditLog.record({
        organizationId,
        actorUserId: ctx.userId,
        action: 'people.imported',
        targetType: 'organization',
        targetId: organizationId,
        metadata: {
          totalRows: parsed.totalRows,
          createdCount,
          updatedCount,
          errorCount: parsed.errors.length,
        },
      });
    }

    return {
      dryRun: input.dryRun,
      totalRows: parsed.totalRows,
      validRowsCount: parsed.validRows.length,
      createdCount,
      updatedCount,
      errors: parsed.errors,
      preview,
    };
  }

  async findByDocumentInternal(
    organizationId: string,
    documentNumber: string,
    documentType?: DocumentType,
  ): Promise<Person | null> {
    return this.repository.findByDocument(organizationId, documentNumber, documentType);
  }

  async findByInstitutionalCodeInternal(
    organizationId: string,
    institutionalCode: string,
  ): Promise<Person | null> {
    return this.repository.findByInstitutionalCode(organizationId, institutionalCode);
  }

  async findByQrTokenInternal(organizationId: string, qrToken: string): Promise<Person | null> {
    return this.repository.findByQrToken(organizationId, qrToken);
  }

  async recordConsentInternal(params: {
    organizationId: string;
    personId: string;
    version: string;
    channel: ConsentChannel;
    ipHash?: string | null;
  }): Promise<DataConsent> {
    const consent: DataConsent = {
      id: this.idGenerator.nextId(),
      organizationId: params.organizationId,
      personId: params.personId,
      version: params.version,
      acceptedAt: this.clock.now(),
      channel: params.channel,
      ipHash: params.ipHash ?? null,
    };
    await this.repository.recordConsent(consent);
    return consent;
  }

  async registerPublicWalkInPersonInternal(params: {
    organizationId: string;
    documentType: DocumentType;
    documentNumber: string;
    fullName: string;
    institutionalCode?: string | null;
    email?: string | null;
    phone?: string | null;
    personType?: PersonType;
    isMinor: boolean;
    guardianName?: string | null;
    guardianDocument?: string | null;
    guardianPhone?: string | null;
    consentVersion: string;
    channel: ConsentChannel;
    ipHash?: string | null;
  }): Promise<Person> {
    validateMinorGuardian({
      isMinor: params.isMinor,
      guardianName: params.guardianName,
      guardianPhone: params.guardianPhone,
    });

    const docNumber = params.documentNumber.trim();
    const existing = await this.repository.findByDocument(
      params.organizationId,
      docNumber,
      params.documentType,
    );

    const now = this.clock.now();
    let person: Person;

    if (existing) {
      person = existing;
    } else {
      person = {
        id: this.idGenerator.nextId(),
        organizationId: params.organizationId,
        documentType: params.documentType,
        documentNumber: docNumber,
        institutionalCode: params.institutionalCode?.trim() || null,
        fullName: params.fullName.trim(),
        email: params.email?.trim().toLowerCase() || null,
        phone: params.phone?.trim() || null,
        personType: params.personType ?? 'student',
        isMinor: params.isMinor,
        guardianName: params.guardianName?.trim() || null,
        guardianDocument: params.guardianDocument?.trim() || null,
        guardianPhone: params.guardianPhone?.trim() || null,
        qrToken: generatePublicCode(12),
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.create(person);
    }

    await this.recordConsentInternal({
      organizationId: params.organizationId,
      personId: person.id,
      version: params.consentVersion,
      channel: params.channel,
      ipHash: params.ipHash ?? null,
    });

    return person;
  }
}
