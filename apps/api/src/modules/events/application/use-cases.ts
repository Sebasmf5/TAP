import type {
  CreateEventRequest,
  EventDto,
  EventQrResponse,
  EventStatus,
  UpdateEventRequest,
} from '@tap/contracts';
import {
  ForbiddenError,
  NotFoundError,
  generatePublicCode,
  requireOrganizationId,
  type AuditLog,
  type Clock,
  type EventBus,
  type IdGenerator,
  type TenantContext,
} from '../../../shared/index.ts';
import {
  EventBuilder,
  EventFactory,
  assertEventEditable,
  toEventDto,
  transitionEventState,
  type EventEntity,
  type EventLifecycleAction,
} from '../domain/entities.ts';
import type { EventPosterRenderer, EventsRepository } from '../domain/ports.ts';

function ensureCanWriteEvents(ctx: TenantContext): string {
  if (ctx.role !== 'org_admin' && ctx.role !== 'operator') {
    throw new ForbiddenError('No tienes permisos para crear o modificar eventos.');
  }
  return requireOrganizationId(ctx);
}

export class EventsService {
  private readonly repository: EventsRepository;
  private readonly posterRenderer: EventPosterRenderer;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly eventBus: EventBus;
  private readonly auditLog: AuditLog;
  private readonly appUrl: string;
  private readonly getOrganizationName?: (organizationId: string) => Promise<string | null>;

  constructor(params: {
    repository: EventsRepository;
    posterRenderer: EventPosterRenderer;
    idGenerator: IdGenerator;
    clock: Clock;
    eventBus: EventBus;
    auditLog: AuditLog;
    appUrl: string;
    getOrganizationName?: (organizationId: string) => Promise<string | null>;
  }) {
    this.repository = params.repository;
    this.posterRenderer = params.posterRenderer;
    this.idGenerator = params.idGenerator;
    this.clock = params.clock;
    this.eventBus = params.eventBus;
    this.auditLog = params.auditLog;
    this.appUrl = params.appUrl.replace(/\/$/, '');
    this.getOrganizationName = params.getOrganizationName;
  }

  private async generateUniquePublicCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generatePublicCode(8);
      const existing = await this.repository.findByPublicCode(code);
      if (!existing) return code;
    }
    return generatePublicCode(10);
  }

  async listEvents(ctx: TenantContext, status?: EventStatus): Promise<EventDto[]> {
    const organizationId = requireOrganizationId(ctx);
    const events = await this.repository.listByOrganization(organizationId, status);
    return events.map(toEventDto);
  }

  async getEventById(ctx: TenantContext, eventId: string): Promise<EventDto> {
    const organizationId = requireOrganizationId(ctx);
    const event = await this.repository.findById(organizationId, eventId);
    if (!event) {
      throw new NotFoundError('El evento solicitado no existe en tu entidad.');
    }
    return toEventDto(event);
  }

  async createEvent(ctx: TenantContext, input: CreateEventRequest): Promise<EventDto> {
    const organizationId = ensureCanWriteEvents(ctx);
    const publicCode = await this.generateUniquePublicCode();
    const now = this.clock.now();

    const event = EventFactory.create({
      id: this.idGenerator.nextId(),
      organizationId,
      publicCode,
      now,
      idGenerator: this.idGenerator,
      request: input,
    });

    await this.repository.create(event);

    await this.auditLog.record({
      organizationId,
      actorUserId: ctx.userId,
      action: 'event.created',
      targetType: 'event',
      targetId: event.id,
      metadata: {
        type: event.type,
        publicCode: event.publicCode,
      },
    });

    return toEventDto(event);
  }

  async updateEvent(
    ctx: TenantContext,
    eventId: string,
    input: UpdateEventRequest,
  ): Promise<EventDto> {
    const organizationId = ensureCanWriteEvents(ctx);
    const existing = await this.repository.findById(organizationId, eventId);
    if (!existing) {
      throw new NotFoundError('El evento solicitado no existe en tu entidad.');
    }

    assertEventEditable(existing);

    const startsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : existing.endsAt;
    const checkinOpensAt = input.checkinOpensAt
      ? new Date(input.checkinOpensAt)
      : existing.checkinOpensAt;
    const checkinClosesAt = input.checkinClosesAt
      ? new Date(input.checkinClosesAt)
      : existing.checkinClosesAt;

    const sessionInputs =
      input.sessions ??
      existing.sessions.map((s) => ({
        title: s.title,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
      }));

    const rebuilt = new EventBuilder()
      .setIdentity({
        id: existing.id,
        organizationId: existing.organizationId,
        publicCode: existing.publicCode,
        now: this.clock.now(),
      })
      .setBasicInfo({
        name: input.name ?? existing.name,
        description: input.description !== undefined ? input.description : existing.description,
        type: existing.type,
        siteId: input.siteId !== undefined ? input.siteId : existing.siteId,
        capacity: input.capacity !== undefined ? input.capacity : existing.capacity,
      })
      .setSchedule({
        startsAt,
        endsAt,
        checkinOpensAt,
        checkinClosesAt,
      })
      .setIdentificationOptions({
        allowedIdentificationModes: input.allowedIdentificationModes
          ? [...input.allowedIdentificationModes]
          : [...existing.allowedIdentificationModes],
        confirmIdentity: input.confirmIdentity ?? existing.confirmIdentity,
        allowWalkIn: input.allowWalkIn ?? existing.allowWalkIn,
      })
      .setCertificateOptions({
        certificateRule: input.certificateRule ?? existing.certificateRule,
        autoIssueCertificates: input.autoIssueCertificates ?? existing.autoIssueCertificates,
      })
      .setSessions(sessionInputs, this.idGenerator)
      .build();

    const updated: EventEntity = {
      ...rebuilt,
      status: existing.status,
      createdAt: existing.createdAt,
      updatedAt: this.clock.now(),
      duplicate: rebuilt.duplicate.bind(rebuilt),
    };

    await this.repository.update(updated);
    return toEventDto(updated);
  }

  async transitionState(
    ctx: TenantContext,
    eventId: string,
    action: EventLifecycleAction,
  ): Promise<EventDto> {
    const organizationId = ensureCanWriteEvents(ctx);
    const existing = await this.repository.findById(organizationId, eventId);
    if (!existing) {
      throw new NotFoundError('El evento solicitado no existe en tu entidad.');
    }

    const { updated, domainEvent } = transitionEventState({
      event: existing,
      action,
      now: this.clock.now(),
      eventIdGenerator: this.idGenerator,
    });

    await this.repository.update(updated);
    await this.eventBus.publish([domainEvent]);

    await this.auditLog.record({
      organizationId,
      actorUserId: ctx.userId,
      action: domainEvent.name,
      targetType: 'event',
      targetId: updated.id,
      metadata: {
        previousStatus: existing.status,
        newStatus: updated.status,
      },
    });

    return toEventDto(updated);
  }

  async duplicateEvent(ctx: TenantContext, eventId: string, newName?: string): Promise<EventDto> {
    const organizationId = ensureCanWriteEvents(ctx);
    const existing = await this.repository.findById(organizationId, eventId);
    if (!existing) {
      throw new NotFoundError('El evento solicitado no existe en tu entidad.');
    }

    const newPublicCode = await this.generateUniquePublicCode();
    const duplicated = existing.duplicate({
      idGenerator: this.idGenerator,
      newPublicCode,
      now: this.clock.now(),
      newName,
    });

    await this.repository.create(duplicated);

    await this.auditLog.record({
      organizationId,
      actorUserId: ctx.userId,
      action: 'event.duplicated',
      targetType: 'event',
      targetId: duplicated.id,
      metadata: { sourceEventId: existing.id },
    });

    return toEventDto(duplicated);
  }

  async getEventQr(ctx: TenantContext, eventId: string): Promise<EventQrResponse> {
    const organizationId = requireOrganizationId(ctx);
    const event = await this.repository.findById(organizationId, eventId);
    if (!event) {
      throw new NotFoundError('El evento solicitado no existe en tu entidad.');
    }

    const checkinUrl = `${this.appUrl}/c/${event.publicCode}`;
    const { qrDataUrl, qrSvg } = await this.posterRenderer.generateQrCodes(checkinUrl);

    return {
      eventId: event.id,
      publicCode: event.publicCode,
      checkinUrl,
      qrDataUrl,
      qrSvg,
    };
  }

  async renderEventPosterPdf(
    ctx: TenantContext,
    eventId: string,
  ): Promise<{
    filename: string;
    pdfBuffer: Buffer;
  }> {
    const organizationId = requireOrganizationId(ctx);
    const event = await this.repository.findById(organizationId, eventId);
    if (!event) {
      throw new NotFoundError('El evento solicitado no existe en tu entidad.');
    }

    const orgName = (await this.getOrganizationName?.(organizationId)) ?? 'Bienestar Institucional';
    const checkinUrl = `${this.appUrl}/c/${event.publicCode}`;
    const pdfBuffer = await this.posterRenderer.renderPosterPdf({
      event,
      organizationName: orgName,
      siteName: null,
      checkinUrl,
    });

    return {
      filename: `afiche_${event.publicCode.toLowerCase()}.pdf`,
      pdfBuffer,
    };
  }

  /**
   * Ejecuta la apertura y cierre programados de eventos según su ventana de check-in
   * (`docs/especificacion.md` B1.4).
   */
  async processScheduledLifecycleTransitions(): Promise<{
    openedCount: number;
    closedCount: number;
  }> {
    const now = this.clock.now();
    const toOpen = await this.repository.findScheduledToOpen(now);
    const toClose = await this.repository.findOpenToClose(now);

    let openedCount = 0;
    let closedCount = 0;

    for (const event of toOpen) {
      const { updated, domainEvent } = transitionEventState({
        event,
        action: 'open',
        now,
        eventIdGenerator: this.idGenerator,
      });
      await this.repository.update(updated);
      await this.eventBus.publish([domainEvent]);
      openedCount += 1;
    }

    for (const event of toClose) {
      const { updated, domainEvent } = transitionEventState({
        event,
        action: 'close',
        now,
        eventIdGenerator: this.idGenerator,
      });
      await this.repository.update(updated);
      await this.eventBus.publish([domainEvent]);
      closedCount += 1;
    }

    return { openedCount, closedCount };
  }

  async findByPublicCodeInternal(publicCode: string): Promise<EventEntity | null> {
    return this.repository.findByPublicCode(publicCode);
  }

  async findByIdInternal(organizationId: string, eventId: string): Promise<EventEntity | null> {
    return this.repository.findById(organizationId, eventId);
  }
}
