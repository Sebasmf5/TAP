import type {
  AttendanceRecordDto,
  AttendanceStatus,
  AttendanceStreamEvent,
  DocumentType,
  EventAttendanceListResponse,
  EventAttendanceSummaryDto,
  PersonType,
  PublicCheckinEventInfo,
  PublicCheckinLookupRequest,
  PublicCheckinLookupResponse,
  PublicCheckinSubmitRequest,
  PublicCheckinSubmitResponse,
  PublicPreregistrationRequest,
  PublicPreregistrationResponse,
  StaffManualAttendanceRequest,
  StaffScanAttendanceRequest,
  VoidAttendanceRequest,
} from '@tap/contracts';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  requireOrganizationId,
  type AuditLog,
  type Clock,
  type DomainEvent,
  type EventBus,
  type IdGenerator,
  type TenantContext,
} from '../../../shared/index.ts';
import type { EventEntity } from '../../events/index.ts';
import type { Organization } from '../../organizations/index.ts';
import { abbreviatePersonName, maskDocumentNumber, type Person } from '../../people/index.ts';
import {
  IdentificationStrategyRegistry,
  computeMedian,
  selectActiveEventSession,
  type AttendanceRecord,
  type PersonLookupGateway,
} from '../domain/entities.ts';
import type { AttendanceRepository } from '../domain/ports.ts';

export interface AttendanceDependencies {
  readonly repository: AttendanceRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly eventBus: EventBus;
  readonly auditLog: AuditLog;
  readonly findEventByPublicCode: (publicCode: string) => Promise<EventEntity | null>;
  readonly findEventById: (organizationId: string, eventId: string) => Promise<EventEntity | null>;
  readonly findOrganizationById: (organizationId: string) => Promise<Organization | null>;
  readonly assertFeatureEnabled: (organizationId: string, feature: 'attendance') => Promise<void>;
  readonly personGateway: PersonLookupGateway & {
    registerPublicWalkInPerson: (params: {
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
      channel: 'public_checkin';
      ipHash?: string | null;
      marketingOptIn?: boolean;
    }) => Promise<Person>;
  };
  readonly enqueuePreregistrationNotification?: (params: {
    organizationId: string;
    event: EventEntity;
    organizationName: string;
    person: Person;
    recipientEmail: string;
  }) => Promise<void>;
}

interface CachedEventInfo {
  readonly expiresAtMs: number;
  readonly info: PublicCheckinEventInfo;
  readonly event: EventEntity;
  readonly organization: Organization;
}

interface CounterEntry {
  validCount: number;
  reconciledAtMs: number;
}

interface RateBucket {
  count: number;
  failedLookups: number;
  windowStartMs: number;
}

type StreamListener = (event: AttendanceStreamEvent) => void;

function ensureCanWriteAttendance(ctx: TenantContext): string {
  if (ctx.role !== 'org_admin' && ctx.role !== 'operator') {
    throw new ForbiddenError('No tienes permisos para registrar o anular asistencias.');
  }
  return requireOrganizationId(ctx);
}

export class AttendanceService {
  private readonly deps: AttendanceDependencies;
  private readonly strategyRegistry: IdentificationStrategyRegistry;
  private readonly publicEventCache = new Map<string, CachedEventInfo>();
  private readonly eventCounters = new Map<string, CounterEntry>();
  private readonly rateBuckets = new Map<string, RateBucket>();
  private readonly streamListeners = new Map<string, Set<StreamListener>>();

  // Umbrales generosos para IP compartida de campus (`AGENTS.md` A7.2):
  // Permite ráfagas masivas (6.000 peticiones/min por IP+código) pero frena enumeración fallida.
  private static readonly MAX_REQUESTS_PER_MINUTE_PER_IP_CODE = 6_000;
  private static readonly MAX_FAILED_LOOKUPS_PER_MINUTE = 30;
  private static readonly PUBLIC_EVENT_CACHE_TTL_MS = 2_000;
  private static readonly COUNTER_RECONCILE_TTL_MS = 30_000;

  constructor(deps: AttendanceDependencies) {
    this.deps = deps;
    this.strategyRegistry = new IdentificationStrategyRegistry();
  }

  private checkPublicRateLimit(ipHash: string | null, publicCode: string): RateBucket {
    const key = `${ipHash ?? 'anon'}:${publicCode.toUpperCase()}`;
    const nowMs = this.deps.clock.now().getTime();
    let bucket = this.rateBuckets.get(key);
    if (!bucket || nowMs - bucket.windowStartMs >= 60_000) {
      bucket = { count: 0, failedLookups: 0, windowStartMs: nowMs };
      this.rateBuckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > AttendanceService.MAX_REQUESTS_PER_MINUTE_PER_IP_CODE) {
      throw new RateLimitError(
        'Se alcanzó el límite temporal de solicitudes para este punto de registro. Intenta de nuevo en unos segundos.',
      );
    }
    if (bucket.failedLookups > AttendanceService.MAX_FAILED_LOOKUPS_PER_MINUTE) {
      throw new RateLimitError(
        'Demasiados intentos con identificadores no encontrados. Verifica tu documento e intenta en un minuto.',
      );
    }
    return bucket;
  }

  private async resolvePublicEventBundle(publicCode: string): Promise<CachedEventInfo> {
    const normalizedCode = publicCode.trim().toUpperCase();
    const now = this.deps.clock.now();
    const nowMs = now.getTime();
    const cached = this.publicEventCache.get(normalizedCode);

    if (cached && cached.expiresAtMs > nowMs) {
      return cached;
    }

    const event = await this.deps.findEventByPublicCode(normalizedCode);
    if (!event) {
      throw new NotFoundError('El código de evento no existe o ya no está disponible.');
    }

    await this.deps.assertFeatureEnabled(event.organizationId, 'attendance');

    const organization = await this.deps.findOrganizationById(event.organizationId);
    if (!organization) {
      throw new NotFoundError('La entidad organizadora no existe.');
    }

    const activeSession = selectActiveEventSession(event.sessions, now);
    const info: PublicCheckinEventInfo = {
      event: {
        id: event.id,
        name: event.name,
        description: event.description,
        eventType: event.type,
        status: event.status,
        location: null,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        checkinOpensAt: event.checkinOpensAt.toISOString(),
        checkinClosesAt: event.checkinClosesAt.toISOString(),
        publicCode: event.publicCode,
        allowedIdentificationModes: [...event.allowedIdentificationModes],
        confirmIdentity: event.confirmIdentity,
        allowWalkIn: event.allowWalkIn,
        activeSession: {
          id: activeSession.id,
          sessionNumber: activeSession.sessionNumber,
          label: activeSession.title,
        },
        sessions: event.sessions.map((s) => ({
          id: s.id,
          eventId: s.eventId,
          sessionNumber: s.sessionNumber,
          title: s.title,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
        })),
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logoUrl: organization.logoUrl,
        dataConsentVersion: organization.dataConsentVersion,
        dataConsentText: organization.dataConsentText,
      },
    };

    const bundle: CachedEventInfo = {
      expiresAtMs: nowMs + AttendanceService.PUBLIC_EVENT_CACHE_TTL_MS,
      info,
      event,
      organization,
    };
    this.publicEventCache.set(normalizedCode, bundle);
    return bundle;
  }

  public invalidateEventCache(publicCode?: string): void {
    if (publicCode) {
      this.publicEventCache.delete(publicCode.trim().toUpperCase());
    } else {
      this.publicEventCache.clear();
    }
  }

  private async getReconciledValidCount(organizationId: string, eventId: string): Promise<number> {
    const nowMs = this.deps.clock.now().getTime();
    const existing = this.eventCounters.get(eventId);
    if (existing && nowMs - existing.reconciledAtMs < AttendanceService.COUNTER_RECONCILE_TTL_MS) {
      return existing.validCount;
    }

    const dbCount = await this.deps.repository.countValidByEvent(organizationId, eventId);
    this.eventCounters.set(eventId, { validCount: dbCount, reconciledAtMs: nowMs });
    return dbCount;
  }

  private incrementInMemoryCounter(eventId: string, delta: number): number {
    const entry = this.eventCounters.get(eventId);
    if (!entry) {
      const next = Math.max(0, delta);
      this.eventCounters.set(eventId, {
        validCount: next,
        reconciledAtMs: this.deps.clock.now().getTime(),
      });
      return next;
    }
    entry.validCount = Math.max(0, entry.validCount + delta);
    return entry.validCount;
  }

  private assertEventAcceptingCheckins(event: EventEntity): void {
    if (event.status !== 'open') {
      throw new ConflictError(
        `Este evento no está recibiendo registros de asistencia en este momento (estado actual: ${event.status}).`,
      );
    }
  }

  async getPublicEventInfo(
    publicCode: string,
    ipHash: string | null,
  ): Promise<PublicCheckinEventInfo> {
    this.checkPublicRateLimit(ipHash, publicCode);
    const bundle = await this.resolvePublicEventBundle(publicCode);
    return bundle.info;
  }

  /**
   * Búsqueda previa para confirmar identidad (`confirm_identity = true`).
   * Cumple `AGENTS.md` A7.2: El cliente NUNCA recibe datos personales completos de otra persona,
   * únicamente nombre abreviado («Juan P.») y documento enmascarado («•••1234»).
   */
  async lookupPublicParticipant(params: {
    publicCode: string;
    input: PublicCheckinLookupRequest;
    ipHash: string | null;
  }): Promise<PublicCheckinLookupResponse> {
    const rateBucket = this.checkPublicRateLimit(params.ipHash, params.publicCode);
    const { event } = await this.resolvePublicEventBundle(params.publicCode);

    const resolved = await this.strategyRegistry.resolve({
      request: {
        organizationId: event.organizationId,
        mode: params.input.identificationMode,
        identifier: params.input.identifier,
        documentType: params.input.documentType,
      },
      allowedEventModes: event.allowedIdentificationModes,
      isStaffOverride: false,
      gateway: this.deps.personGateway,
    });

    if (!resolved) {
      if (!event.allowWalkIn) {
        rateBucket.failedLookups += 1;
      }
      return {
        found: false,
        maskedName: null,
        maskedDocument: null,
        allowWalkIn: event.allowWalkIn,
      };
    }

    return {
      found: true,
      maskedName: abbreviatePersonName(resolved.fullName),
      maskedDocument: maskDocumentNumber(resolved.documentNumber),
      allowWalkIn: event.allowWalkIn,
    };
  }

  /**
   * Ruta caliente de check-in público (`POST /public/checkin/:code`).
   * - Idempotente por `(event_id, session_id, person_id) WHERE status = 'valid'`.
   * - Si la persona no existe y `allow_walk_in` está activo, responde `needs_registration`
   *   o crea la persona con su consentimiento Ley 1581 si adjuntó `walkInRegistration`.
   * - Cero efectos secundarios síncronos (sin llamadas a SMTP ni generación de PDF en línea).
   */
  async submitPublicCheckin(params: {
    publicCode: string;
    input: PublicCheckinSubmitRequest;
    ipHash: string | null;
    userAgent: string | null;
  }): Promise<PublicCheckinSubmitResponse> {
    const rateBucket = this.checkPublicRateLimit(params.ipHash, params.publicCode);
    const { event, organization } = await this.resolvePublicEventBundle(params.publicCode);
    this.assertEventAcceptingCheckins(event);

    const now = this.deps.clock.now();
    const session = selectActiveEventSession(event.sessions, now, params.input.sessionId);

    let person = await this.strategyRegistry.resolve({
      request: {
        organizationId: event.organizationId,
        mode: params.input.identificationMode,
        identifier: params.input.identifier,
        documentType: params.input.documentType,
      },
      allowedEventModes: event.allowedIdentificationModes,
      isStaffOverride: false,
      gateway: this.deps.personGateway,
    });

    if (!person) {
      if (!event.allowWalkIn) {
        rateBucket.failedLookups += 1;
        throw new NotFoundError(
          'No encontramos tu documento en la lista de este evento y el registro espontáneo no está habilitado.',
        );
      }

      if (!params.input.walkInRegistration) {
        return {
          outcome: 'needs_registration',
          attendanceId: null,
          checkedInAt: null,
          maskedName: null,
          maskedDocument: maskDocumentNumber(params.input.identifier),
          sessionNumber: session.sessionNumber,
          sessionLabel: session.title,
          message:
            'Completa tus datos básicos y acepta la autorización de tratamiento de datos para completar tu asistencia.',
        };
      }

      const created = await this.deps.personGateway.registerPublicWalkInPerson({
        organizationId: event.organizationId,
        documentType: params.input.walkInRegistration.documentType,
        documentNumber: params.input.walkInRegistration.documentNumber,
        fullName: params.input.walkInRegistration.fullName,
        institutionalCode: params.input.walkInRegistration.institutionalCode ?? null,
        email: params.input.walkInRegistration.email ?? null,
        phone: params.input.walkInRegistration.phone ?? null,
        personType: params.input.walkInRegistration.personType,
        isMinor: params.input.walkInRegistration.isMinor,
        guardianName: params.input.walkInRegistration.guardianName ?? null,
        guardianDocument: params.input.walkInRegistration.guardianDocument ?? null,
        guardianPhone: params.input.walkInRegistration.guardianPhone ?? null,
        consentVersion: organization.dataConsentVersion,
        channel: 'public_checkin',
        ipHash: params.ipHash,
        marketingOptIn: params.input.walkInRegistration.marketingOptIn ?? false,
      });

      person = {
        id: created.id,
        organizationId: created.organizationId,
        documentType: created.documentType,
        documentNumber: created.documentNumber,
        institutionalCode: created.institutionalCode,
        fullName: created.fullName,
        personType: created.personType,
      };
    }

    if (event.capacity !== null) {
      const currentValid = await this.getReconciledValidCount(event.organizationId, event.id);
      if (currentValid >= event.capacity) {
        throw new ConflictError('El evento ha alcanzado su aforo máximo permitido.');
      }
    }

    const candidateRecord: AttendanceRecord = {
      id: this.deps.idGenerator.nextId(),
      organizationId: event.organizationId,
      eventId: event.id,
      sessionId: session.id,
      personId: person.id,
      checkedInAt: now,
      method: 'event_qr',
      registeredBy: null,
      status: 'valid',
      voidReason: null,
      voidedAt: null,
      voidedBy: null,
      clientDurationMs: params.input.clientDurationMs ?? null,
      ipHash: params.ipHash,
      userAgent: params.userAgent ? params.userAgent.slice(0, 255) : null,
    };

    const { inserted, record } =
      await this.deps.repository.insertCheckinIfNotExists(candidateRecord);

    const maskedName = abbreviatePersonName(person.fullName);
    const maskedDocument = maskDocumentNumber(person.documentNumber);

    if (!inserted) {
      return {
        outcome: 'already_registered',
        attendanceId: record.id,
        checkedInAt: record.checkedInAt.toISOString(),
        maskedName,
        maskedDocument,
        sessionNumber: session.sessionNumber,
        sessionLabel: session.title,
        message: 'Ya tenías asistencia registrada en esta sesión. Conservamos tu hora original.',
      };
    }

    const totalValid = this.incrementInMemoryCounter(event.id, 1);

    const domainEvent: DomainEvent<
      string,
      {
        attendanceId: string;
        organizationId: string;
        eventId: string;
        sessionId: string;
        personId: string;
        method: 'event_qr';
        checkedInAt: string;
      }
    > = {
      id: this.deps.idGenerator.nextId(),
      name: 'attendance.registered',
      occurredAt: now,
      organizationId: event.organizationId,
      payload: {
        attendanceId: record.id,
        organizationId: event.organizationId,
        eventId: event.id,
        sessionId: session.id,
        personId: person.id,
        method: 'event_qr',
        checkedInAt: record.checkedInAt.toISOString(),
      },
    };
    await this.deps.eventBus.publish([domainEvent]);

    this.broadcastStreamEvent(event.organizationId, event.id, {
      type: 'attendance.registered',
      eventId: event.id,
      totalValid,
      totalVoided: 0,
      latestRecord: {
        id: record.id,
        organizationId: record.organizationId,
        eventId: record.eventId,
        sessionId: record.sessionId,
        sessionNumber: session.sessionNumber,
        sessionLabel: session.title,
        personId: person.id,
        personFullName: person.fullName,
        personDocumentType: person.documentType,
        personDocumentNumber: maskedDocument,
        personInstitutionalCode: person.institutionalCode,
        personType: person.personType,
        checkedInAt: record.checkedInAt.toISOString(),
        method: record.method,
        registeredBy: record.registeredBy,
        status: record.status,
        voidReason: null,
        voidedAt: null,
        voidedBy: null,
        clientDurationMs: record.clientDurationMs,
      },
      occurredAt: now.toISOString(),
    });

    return {
      outcome: 'registered',
      attendanceId: record.id,
      checkedInAt: record.checkedInAt.toISOString(),
      maskedName,
      maskedDocument,
      sessionNumber: session.sessionNumber,
      sessionLabel: session.title,
      message: 'Asistencia registrada correctamente.',
    };
  }

  /**
   * Modo quiosco: el funcionario escanea el QR único del carné de la persona (`POST /events/:id/attendance/scan`).
   */
  async scanPersonQrByStaff(
    ctx: TenantContext,
    eventId: string,
    input: StaffScanAttendanceRequest,
  ): Promise<PublicCheckinSubmitResponse> {
    const organizationId = ensureCanWriteAttendance(ctx);
    await this.deps.assertFeatureEnabled(organizationId, 'attendance');

    const event = await this.deps.findEventById(organizationId, eventId);
    if (!event) {
      throw new NotFoundError('El evento solicitado no existe en tu entidad.');
    }
    this.assertEventAcceptingCheckins(event);

    const now = this.deps.clock.now();
    const session = selectActiveEventSession(event.sessions, now, input.sessionId);

    const person = await this.strategyRegistry.resolve({
      request: {
        organizationId,
        mode: 'person_qr',
        identifier: input.qrToken,
      },
      allowedEventModes: event.allowedIdentificationModes,
      isStaffOverride: true,
      gateway: this.deps.personGateway,
    });

    if (!person) {
      throw new NotFoundError(
        'El código QR del carné no corresponde a ningún participante activo.',
      );
    }

    return this.registerStaffAttendanceInternal({
      ctx,
      event,
      session,
      person,
      method: 'person_qr',
      clientDurationMs: input.clientDurationMs ?? null,
      now,
    });
  }

  /**
   * Registro manual por funcionario (`POST /events/:id/attendance`).
   */
  async registerManualByStaff(
    ctx: TenantContext,
    eventId: string,
    input: StaffManualAttendanceRequest,
  ): Promise<PublicCheckinSubmitResponse> {
    const organizationId = ensureCanWriteAttendance(ctx);
    await this.deps.assertFeatureEnabled(organizationId, 'attendance');

    const event = await this.deps.findEventById(organizationId, eventId);
    if (!event) {
      throw new NotFoundError('El evento solicitado no existe en tu entidad.');
    }
    this.assertEventAcceptingCheckins(event);

    const now = this.deps.clock.now();
    const session = selectActiveEventSession(event.sessions, now, input.sessionId);

    const person = await this.strategyRegistry.resolve({
      request: {
        organizationId,
        mode: input.identificationMode,
        identifier: input.identifier,
        documentType: input.documentType,
      },
      allowedEventModes: event.allowedIdentificationModes,
      isStaffOverride: true,
      gateway: this.deps.personGateway,
    });

    if (!person) {
      throw new NotFoundError(
        'No se encontró ningún participante en el directorio con ese documento o código.',
      );
    }

    return this.registerStaffAttendanceInternal({
      ctx,
      event,
      session,
      person,
      method: 'manual',
      clientDurationMs: null,
      now,
    });
  }

  private async registerStaffAttendanceInternal(params: {
    ctx: TenantContext;
    event: EventEntity;
    session: { id: string; sessionNumber: number; title: string };
    person: {
      id: string;
      organizationId: string;
      documentType: DocumentType;
      documentNumber: string;
      institutionalCode: string | null;
      fullName: string;
      personType: PersonType;
    };
    method: 'person_qr' | 'manual';
    clientDurationMs: number | null;
    now: Date;
  }): Promise<PublicCheckinSubmitResponse> {
    const { ctx, event, session, person, method, clientDurationMs, now } = params;

    if (event.capacity !== null) {
      const currentValid = await this.getReconciledValidCount(event.organizationId, event.id);
      if (currentValid >= event.capacity) {
        throw new ConflictError('El evento ha alcanzado su aforo máximo permitido.');
      }
    }

    const candidateRecord: AttendanceRecord = {
      id: this.deps.idGenerator.nextId(),
      organizationId: event.organizationId,
      eventId: event.id,
      sessionId: session.id,
      personId: person.id,
      checkedInAt: now,
      method,
      registeredBy: ctx.userId,
      status: 'valid',
      voidReason: null,
      voidedAt: null,
      voidedBy: null,
      clientDurationMs,
      ipHash: null,
      userAgent: null,
    };

    const { inserted, record } =
      await this.deps.repository.insertCheckinIfNotExists(candidateRecord);

    const maskedDocument = maskDocumentNumber(person.documentNumber);

    if (!inserted) {
      return {
        outcome: 'already_registered',
        attendanceId: record.id,
        checkedInAt: record.checkedInAt.toISOString(),
        maskedName: person.fullName,
        maskedDocument,
        sessionNumber: session.sessionNumber,
        sessionLabel: session.title,
        message: `${person.fullName} ya tenía asistencia registrada en esta sesión.`,
      };
    }

    const totalValid = this.incrementInMemoryCounter(event.id, 1);

    const domainEvent: DomainEvent<
      string,
      {
        attendanceId: string;
        organizationId: string;
        eventId: string;
        sessionId: string;
        personId: string;
        method: 'person_qr' | 'manual';
        checkedInAt: string;
      }
    > = {
      id: this.deps.idGenerator.nextId(),
      name: 'attendance.registered',
      occurredAt: now,
      organizationId: event.organizationId,
      payload: {
        attendanceId: record.id,
        organizationId: event.organizationId,
        eventId: event.id,
        sessionId: session.id,
        personId: person.id,
        method,
        checkedInAt: record.checkedInAt.toISOString(),
      },
    };
    await this.deps.eventBus.publish([domainEvent]);

    this.broadcastStreamEvent(event.organizationId, event.id, {
      type: 'attendance.registered',
      eventId: event.id,
      totalValid,
      totalVoided: 0,
      latestRecord: {
        id: record.id,
        organizationId: record.organizationId,
        eventId: record.eventId,
        sessionId: record.sessionId,
        sessionNumber: session.sessionNumber,
        sessionLabel: session.title,
        personId: person.id,
        personFullName: person.fullName,
        personDocumentType: person.documentType,
        personDocumentNumber: maskedDocument,
        personInstitutionalCode: person.institutionalCode,
        personType: person.personType,
        checkedInAt: record.checkedInAt.toISOString(),
        method: record.method,
        registeredBy: record.registeredBy,
        status: record.status,
        voidReason: null,
        voidedAt: null,
        voidedBy: null,
        clientDurationMs: record.clientDurationMs,
      },
      occurredAt: now.toISOString(),
    });

    return {
      outcome: 'registered',
      attendanceId: record.id,
      checkedInAt: record.checkedInAt.toISOString(),
      maskedName: person.fullName,
      maskedDocument,
      sessionNumber: session.sessionNumber,
      sessionLabel: session.title,
      message: `Asistencia registrada para ${person.fullName}.`,
    };
  }

  /**
   * Anulación de asistencia con motivo obligatorio y registro en `AuditLog` (`POST /attendance/:id/void`).
   */
  async voidAttendance(
    ctx: TenantContext,
    attendanceId: string,
    input: VoidAttendanceRequest,
  ): Promise<AttendanceRecordDto> {
    const organizationId = ensureCanWriteAttendance(ctx);
    const existing = await this.deps.repository.findById(organizationId, attendanceId);
    if (!existing) {
      throw new NotFoundError('El registro de asistencia no existe en tu entidad.');
    }
    if (existing.status === 'voided') {
      throw new ConflictError('Este registro de asistencia ya fue anulado previamente.');
    }

    const reason = input.reason.trim();
    if (reason.length < 5) {
      throw new ValidationError('Debes indicar un motivo de anulación de al menos 5 caracteres.');
    }

    const now = this.deps.clock.now();
    const updated = await this.deps.repository.voidRecord({
      organizationId,
      attendanceId,
      reason,
      voidedAt: now,
      voidedBy: ctx.userId,
    });

    if (!updated) {
      throw new ConflictError('No fue posible anular el registro de asistencia.');
    }

    const totalValid = this.incrementInMemoryCounter(updated.eventId, -1);

    await this.deps.auditLog.record({
      organizationId,
      actorUserId: ctx.userId,
      action: 'attendance.voided',
      targetType: 'attendance',
      targetId: updated.id,
      metadata: {
        eventId: updated.eventId,
        sessionId: updated.sessionId,
        personId: updated.personId,
        reason,
      },
    });

    const event = await this.deps.findEventById(organizationId, updated.eventId);
    const session = event?.sessions.find((s) => s.id === updated.sessionId);
    const person = await this.deps.personGateway.findById(organizationId, updated.personId);

    const dto: AttendanceRecordDto = {
      id: updated.id,
      organizationId: updated.organizationId,
      eventId: updated.eventId,
      sessionId: updated.sessionId,
      sessionNumber: session?.sessionNumber ?? 1,
      sessionLabel: session?.title ?? 'Sesión 1',
      personId: updated.personId,
      personFullName: person?.fullName ?? 'Participante',
      personDocumentType: person?.documentType ?? 'CC',
      personDocumentNumber:
        ctx.role === 'org_admin'
          ? (person?.documentNumber ?? '')
          : maskDocumentNumber(person?.documentNumber ?? ''),
      personInstitutionalCode: person?.institutionalCode ?? null,
      personType: person?.personType ?? 'student',
      checkedInAt: updated.checkedInAt.toISOString(),
      method: updated.method,
      registeredBy: updated.registeredBy,
      status: updated.status,
      voidReason: updated.voidReason,
      voidedAt: updated.voidedAt ? updated.voidedAt.toISOString() : null,
      voidedBy: updated.voidedBy,
      clientDurationMs: updated.clientDurationMs,
    };

    this.broadcastStreamEvent(organizationId, updated.eventId, {
      type: 'attendance.voided',
      eventId: updated.eventId,
      totalValid,
      totalVoided: 1,
      latestRecord: dto,
      occurredAt: now.toISOString(),
    });

    return dto;
  }

  /**
   * Lista los registros de asistencia y las estadísticas básicas de un evento (`GET /events/:id/attendance`).
   */
  async listEventAttendance(
    ctx: TenantContext,
    eventId: string,
    filters?: {
      sessionId?: string;
      status?: AttendanceStatus;
    },
  ): Promise<EventAttendanceListResponse> {
    const organizationId = requireOrganizationId(ctx);
    const event = await this.deps.findEventById(organizationId, eventId);
    if (!event) {
      throw new NotFoundError('El evento solicitado no existe en tu entidad.');
    }

    const allEventRecords = await this.deps.repository.listByEvent(organizationId, eventId);
    const sessionsById = new Map(event.sessions.map((s) => [s.id, s]));

    let totalValid = 0;
    let totalVoided = 0;
    const uniquePersonIds = new Set<string>();
    const durations: number[] = [];
    const byMethod = { event_qr: 0, person_qr: 0, manual: 0 };
    const countBySession = new Map<string, number>();

    for (const session of event.sessions) {
      countBySession.set(session.id, 0);
    }

    for (const r of allEventRecords) {
      if (r.status === 'valid') {
        totalValid += 1;
        uniquePersonIds.add(r.personId);
        byMethod[r.method] = (byMethod[r.method] ?? 0) + 1;
        countBySession.set(r.sessionId, (countBySession.get(r.sessionId) ?? 0) + 1);
        if (r.clientDurationMs !== null && r.clientDurationMs >= 0) {
          durations.push(r.clientDurationMs);
        }
      } else {
        totalVoided += 1;
      }
    }

    this.eventCounters.set(eventId, {
      validCount: totalValid,
      reconciledAtMs: this.deps.clock.now().getTime(),
    });

    const filteredRecords = allEventRecords.filter((r) => {
      if (filters?.sessionId && r.sessionId !== filters.sessionId) return false;
      if (filters?.status && r.status !== filters.status) return false;
      return true;
    });

    const personCache = new Map<string, Awaited<ReturnType<PersonLookupGateway['findById']>>>();
    const recordDtos: AttendanceRecordDto[] = [];

    for (const r of filteredRecords) {
      let person = personCache.get(r.personId);
      if (person === undefined) {
        person = await this.deps.personGateway.findById(organizationId, r.personId);
        personCache.set(r.personId, person);
      }
      const session = sessionsById.get(r.sessionId);

      recordDtos.push({
        id: r.id,
        organizationId: r.organizationId,
        eventId: r.eventId,
        sessionId: r.sessionId,
        sessionNumber: session?.sessionNumber ?? 1,
        sessionLabel: session?.title ?? 'Sesión 1',
        personId: r.personId,
        personFullName: person?.fullName ?? 'Participante',
        personDocumentType: person?.documentType ?? 'CC',
        personDocumentNumber:
          ctx.role === 'org_admin'
            ? (person?.documentNumber ?? '')
            : maskDocumentNumber(person?.documentNumber ?? ''),
        personInstitutionalCode: person?.institutionalCode ?? null,
        personType: person?.personType ?? 'student',
        checkedInAt: r.checkedInAt.toISOString(),
        method: r.method,
        registeredBy: r.registeredBy,
        status: r.status,
        voidReason: r.voidReason,
        voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
        voidedBy: r.voidedBy,
        clientDurationMs: r.clientDurationMs,
      });
    }

    const summary: EventAttendanceSummaryDto = {
      eventId: event.id,
      totalValid,
      totalVoided,
      uniqueAttendees: uniquePersonIds.size,
      capacity: event.capacity,
      remainingCapacity: event.capacity !== null ? Math.max(0, event.capacity - totalValid) : null,
      medianClientDurationMs: computeMedian(durations),
      byMethod,
      bySession: event.sessions.map((s) => ({
        sessionId: s.id,
        sessionNumber: s.sessionNumber,
        label: s.title,
        validCount: countBySession.get(s.id) ?? 0,
      })),
    };

    return {
      summary,
      records: recordDtos,
    };
  }

  /**
   * Suscripción al flujo en vivo de un evento (`GET /events/:id/attendance/stream`).
   */
  async subscribeToEventStream(
    ctx: TenantContext,
    eventId: string,
    listener: StreamListener,
  ): Promise<{
    initialSnapshot: AttendanceStreamEvent;
    unsubscribe: () => void;
  }> {
    const organizationId = requireOrganizationId(ctx);
    const event = await this.deps.findEventById(organizationId, eventId);
    if (!event) {
      throw new NotFoundError('El evento solicitado no existe en tu entidad.');
    }

    const listResponse = await this.listEventAttendance(ctx, eventId);
    const initialSnapshot: AttendanceStreamEvent = {
      type: 'snapshot',
      eventId: event.id,
      totalValid: listResponse.summary.totalValid,
      totalVoided: listResponse.summary.totalVoided,
      latestRecord: listResponse.records[0] ?? null,
      occurredAt: this.deps.clock.now().toISOString(),
    };

    const key = `${organizationId}:${eventId}`;
    let set = this.streamListeners.get(key);
    if (!set) {
      set = new Set<StreamListener>();
      this.streamListeners.set(key, set);
    }
    set.add(listener);

    return {
      initialSnapshot,
      unsubscribe: () => {
        const currentSet = this.streamListeners.get(key);
        if (currentSet) {
          currentSet.delete(listener);
          if (currentSet.size === 0) {
            this.streamListeners.delete(key);
          }
        }
      },
    };
  }

  private broadcastStreamEvent(
    organizationId: string,
    eventId: string,
    event: AttendanceStreamEvent,
  ): void {
    const key = `${organizationId}:${eventId}`;
    const listeners = this.streamListeners.get(key);
    if (!listeners || listeners.size === 0) {
      return;
    }
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Aislar fallos de clientes desconectados
      }
    }
  }

  /**
   * Consulta interna para que el módulo `certificates` (Fase 4) evalúe elegibilidad
   * sin leer directamente las tablas de `attendance`.
   */
  async listValidByEventInternal(
    organizationId: string,
    eventId: string,
  ): Promise<AttendanceRecord[]> {
    return this.deps.repository.listByEvent(organizationId, eventId, { status: 'valid' });
  }

  /**
   * Preregistro público de un asistente a un evento: registra/actualiza sus datos,
   * guarda consentimiento Ley 1581 y encola el correo de confirmación con su código QR.
   */
  async submitPublicPreregistration(params: {
    publicCode: string;
    input: PublicPreregistrationRequest;
    ipHash?: string | null;
  }): Promise<PublicPreregistrationResponse> {
    this.checkPublicRateLimit(params.ipHash ?? null, params.publicCode);

    const { event, organization } = await this.resolvePublicEventBundle(params.publicCode);
    await this.deps.assertFeatureEnabled(event.organizationId, 'attendance');

    if (event.status === 'cancelled' || event.status === 'closed') {
      throw new ValidationError('Este evento ya no admite nuevos preregistros.');
    }

    const person = await this.deps.personGateway.registerPublicWalkInPerson({
      organizationId: event.organizationId,
      documentType: params.input.documentType,
      documentNumber: params.input.documentNumber,
      fullName: params.input.fullName,
      institutionalCode: params.input.institutionalCode ?? null,
      email: params.input.email,
      phone: params.input.phone ?? null,
      personType: params.input.personType,
      isMinor: params.input.isMinor,
      guardianName: params.input.guardianName ?? null,
      guardianDocument: params.input.guardianDocument ?? null,
      guardianPhone: params.input.guardianPhone ?? null,
      consentVersion: organization.dataConsentVersion,
      channel: 'public_checkin',
      ipHash: params.ipHash ?? null,
      marketingOptIn: params.input.marketingOptIn,
    });

    if (this.deps.enqueuePreregistrationNotification) {
      await this.deps.enqueuePreregistrationNotification({
        organizationId: event.organizationId,
        event,
        organizationName: organization.name,
        person,
        recipientEmail: params.input.email,
      });
    }

    await this.deps.auditLog.record({
      organizationId: event.organizationId,
      actorUserId: null,
      action: 'attendance.preregistration',
      targetType: 'event',
      targetId: event.id,
      metadata: {
        personId: person.id,
        publicCode: event.publicCode,
      },
    });

    const [localPart = '', domainPart = ''] = params.input.email.split('@');
    const maskedLocal =
      localPart.length <= 2 ? `${localPart[0] ?? '*'}••` : `${localPart.slice(0, 2)}•••`;
    const maskedEmail = domainPart ? `${maskedLocal}@${domainPart}` : '***';

    return {
      preregistered: true,
      maskedName: abbreviatePersonName(person.fullName),
      maskedEmail,
      eventName: event.name,
      message: `Preregistro confirmado para ${event.name}. Enviamos la confirmación y tu código personal de ingreso a ${maskedEmail}.`,
    };
  }
}
