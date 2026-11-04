import type {
  CertificateRule,
  CreateEventRequest,
  EventDto,
  EventSessionInput,
  EventStatus,
  EventType,
  IdentificationMode,
} from '@tap/contracts';
import {
  ConflictError,
  ValidationError,
  type DomainEvent,
  type IdGenerator,
} from '../../../shared/index.ts';

export interface EventSession {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly sessionNumber: number;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly createdAt: Date;
}

export interface EventEntity {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly type: EventType;
  readonly status: EventStatus;
  readonly publicCode: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly checkinOpensAt: Date;
  readonly checkinClosesAt: Date;
  readonly capacity: number | null;
  readonly allowedIdentificationModes: ReadonlyArray<IdentificationMode>;
  readonly confirmIdentity: boolean;
  readonly allowWalkIn: boolean;
  readonly certificateRule: CertificateRule;
  readonly autoIssueCertificates: boolean;
  readonly sessions: ReadonlyArray<EventSession>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  duplicate(params: {
    idGenerator: IdGenerator;
    newPublicCode: string;
    now: Date;
    newName?: string;
  }): EventEntity;
}

class EventAggregate implements EventEntity {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly type: EventType;
  readonly status: EventStatus;
  readonly publicCode: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly checkinOpensAt: Date;
  readonly checkinClosesAt: Date;
  readonly capacity: number | null;
  readonly allowedIdentificationModes: ReadonlyArray<IdentificationMode>;
  readonly confirmIdentity: boolean;
  readonly allowWalkIn: boolean;
  readonly certificateRule: CertificateRule;
  readonly autoIssueCertificates: boolean;
  readonly sessions: ReadonlyArray<EventSession>;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: Omit<EventEntity, 'duplicate'>) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.siteId = props.siteId;
    this.name = props.name;
    this.description = props.description;
    this.type = props.type;
    this.status = props.status;
    this.publicCode = props.publicCode;
    this.startsAt = props.startsAt;
    this.endsAt = props.endsAt;
    this.checkinOpensAt = props.checkinOpensAt;
    this.checkinClosesAt = props.checkinClosesAt;
    this.capacity = props.capacity;
    this.allowedIdentificationModes = props.allowedIdentificationModes;
    this.confirmIdentity = props.confirmIdentity;
    this.allowWalkIn = props.allowWalkIn;
    this.certificateRule = props.certificateRule;
    this.autoIssueCertificates = props.autoIssueCertificates;
    this.sessions = props.sessions;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Patrón Prototype (AGENTS.md A6): clona la configuración y sesiones en estado `draft`
   * con un nuevo código público e identificadores frescos, sin asistencias.
   */
  duplicate(params: {
    idGenerator: IdGenerator;
    newPublicCode: string;
    now: Date;
    newName?: string;
  }): EventEntity {
    const newEventId = params.idGenerator.nextId();
    const clonedSessions: EventSession[] = this.sessions.map((s) => ({
      id: params.idGenerator.nextId(),
      organizationId: this.organizationId,
      eventId: newEventId,
      sessionNumber: s.sessionNumber,
      title: s.title,
      startsAt: new Date(s.startsAt.getTime()),
      endsAt: new Date(s.endsAt.getTime()),
      createdAt: params.now,
    }));

    return new EventAggregate({
      id: newEventId,
      organizationId: this.organizationId,
      siteId: this.siteId,
      name: params.newName?.trim() || `${this.name} (Copia)`,
      description: this.description,
      type: this.type,
      status: 'draft',
      publicCode: params.newPublicCode,
      startsAt: new Date(this.startsAt.getTime()),
      endsAt: new Date(this.endsAt.getTime()),
      checkinOpensAt: new Date(this.checkinOpensAt.getTime()),
      checkinClosesAt: new Date(this.checkinClosesAt.getTime()),
      capacity: this.capacity,
      allowedIdentificationModes: [...this.allowedIdentificationModes],
      confirmIdentity: this.confirmIdentity,
      allowWalkIn: this.allowWalkIn,
      certificateRule: { ...this.certificateRule },
      autoIssueCertificates: this.autoIssueCertificates,
      sessions: clonedSessions,
      createdAt: params.now,
      updatedAt: params.now,
    });
  }
}

export function hydrateEventEntity(props: Omit<EventEntity, 'duplicate'>): EventEntity {
  return new EventAggregate(props);
}

/**
 * Patrón Builder (AGENTS.md A6): arma sesiones, ventana de check-in y regla de certificado
 * paso a paso y valida invariantes en `build()`.
 */
export class EventBuilder {
  private id = '';
  private organizationId = '';
  private siteId: string | null = null;
  private name = '';
  private description: string | null = null;
  private type: EventType = 'mass';
  private status: EventStatus = 'draft';
  private publicCode = '';
  private startsAt: Date | null = null;
  private endsAt: Date | null = null;
  private checkinOpensAt: Date | null = null;
  private checkinClosesAt: Date | null = null;
  private capacity: number | null = null;
  private allowedIdentificationModes: IdentificationMode[] = ['document', 'institutional_code'];
  private confirmIdentity = true;
  private allowWalkIn = false;
  private certificateRule: CertificateRule = { type: 'any_attendance', hours: 2 };
  private autoIssueCertificates = false;
  private sessions: EventSession[] = [];
  private now: Date = new Date();

  setIdentity(params: { id: string; organizationId: string; publicCode: string; now: Date }): this {
    this.id = params.id;
    this.organizationId = params.organizationId;
    this.publicCode = params.publicCode;
    this.now = params.now;
    return this;
  }

  setBasicInfo(params: {
    name: string;
    description?: string | null;
    type: EventType;
    siteId?: string | null;
    capacity?: number | null;
  }): this {
    this.name = params.name.trim();
    this.description = params.description?.trim() || null;
    this.type = params.type;
    this.siteId = params.siteId ?? null;
    this.capacity = params.capacity ?? null;
    return this;
  }

  setSchedule(params: {
    startsAt: Date;
    endsAt: Date;
    checkinOpensAt?: Date;
    checkinClosesAt?: Date;
  }): this {
    this.startsAt = params.startsAt;
    this.endsAt = params.endsAt;
    this.checkinOpensAt =
      params.checkinOpensAt ?? new Date(params.startsAt.getTime() - 30 * 60_000);
    this.checkinClosesAt = params.checkinClosesAt ?? params.endsAt;
    return this;
  }

  setIdentificationOptions(params: {
    allowedIdentificationModes: IdentificationMode[];
    confirmIdentity: boolean;
    allowWalkIn: boolean;
  }): this {
    this.allowedIdentificationModes = [...params.allowedIdentificationModes];
    this.confirmIdentity = params.confirmIdentity;
    this.allowWalkIn = params.allowWalkIn;
    return this;
  }

  setCertificateOptions(params: {
    certificateRule: CertificateRule;
    autoIssueCertificates: boolean;
  }): this {
    this.certificateRule = { ...params.certificateRule };
    this.autoIssueCertificates = params.autoIssueCertificates;
    return this;
  }

  setSessions(inputs: ReadonlyArray<EventSessionInput>, idGenerator: IdGenerator): this {
    this.sessions = inputs.map((item, idx) => ({
      id: idGenerator.nextId(),
      organizationId: this.organizationId,
      eventId: this.id,
      sessionNumber: idx + 1,
      title: item.title.trim(),
      startsAt: new Date(item.startsAt),
      endsAt: new Date(item.endsAt),
      createdAt: this.now,
    }));
    return this;
  }

  build(): EventEntity {
    if (!this.id || !this.organizationId || !this.publicCode) {
      throw new ValidationError('Faltan los identificadores base del evento.');
    }
    if (this.name.length < 3) {
      throw new ValidationError('El nombre del evento debe tener al menos 3 caracteres.');
    }
    if (!this.startsAt || !this.endsAt || !this.checkinOpensAt || !this.checkinClosesAt) {
      throw new ValidationError('Debes definir las fechas de inicio y fin del evento.');
    }
    if (this.endsAt.getTime() <= this.startsAt.getTime()) {
      throw new ValidationError(
        'La fecha de finalización debe ser posterior a la fecha de inicio.',
        [{ path: 'endsAt', message: 'Debe ser posterior al inicio.' }],
      );
    }
    if (this.checkinClosesAt.getTime() <= this.checkinOpensAt.getTime()) {
      throw new ValidationError(
        'El cierre de la ventana de check-in debe ser posterior a su apertura.',
        [{ path: 'checkinClosesAt', message: 'Ventana de check-in inválida.' }],
      );
    }
    if (this.allowedIdentificationModes.length === 0) {
      throw new ValidationError('El evento debe admitir al menos un método de identificación.');
    }

    for (const s of this.sessions) {
      if (s.endsAt.getTime() <= s.startsAt.getTime()) {
        throw new ValidationError(
          `La sesión "${s.title}" tiene una hora de fin anterior o igual a su inicio.`,
        );
      }
    }

    if (this.type === 'course' && this.sessions.length < 2) {
      throw new ValidationError(
        'Un curso o taller multiciclo requiere configurar al menos 2 sesiones.',
        [{ path: 'sessions', message: 'Agrega al menos 2 sesiones para un curso.' }],
      );
    }

    if (
      this.certificateRule.type === 'min_sessions' &&
      (!this.certificateRule.minSessions || this.certificateRule.minSessions > this.sessions.length)
    ) {
      throw new ValidationError(
        'El mínimo de sesiones exigido para certificado no puede superar el total de sesiones del evento.',
        [{ path: 'certificateRule.minSessions', message: 'Mínimo de sesiones inválido.' }],
      );
    }

    return new EventAggregate({
      id: this.id,
      organizationId: this.organizationId,
      siteId: this.siteId,
      name: this.name,
      description: this.description,
      type: this.type,
      status: this.status,
      publicCode: this.publicCode,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      checkinOpensAt: this.checkinOpensAt,
      checkinClosesAt: this.checkinClosesAt,
      capacity: this.capacity,
      allowedIdentificationModes: this.allowedIdentificationModes,
      confirmIdentity: this.confirmIdentity,
      allowWalkIn: this.allowWalkIn,
      certificateRule: this.certificateRule,
      autoIssueCertificates: this.autoIssueCertificates,
      sessions: this.sessions,
      createdAt: this.now,
      updatedAt: this.now,
    });
  }
}

/**
 * Patrón Factory Method (AGENTS.md A6): `EventCreator` con creadores concretos
 * para `MassEventCreator`, `CourseEventCreator` y `RecurringClassCreator`.
 */
export interface EventCreatorContext {
  readonly id: string;
  readonly organizationId: string;
  readonly publicCode: string;
  readonly now: Date;
  readonly idGenerator: IdGenerator;
  readonly request: CreateEventRequest;
}

export abstract class EventCreator {
  abstract create(ctx: EventCreatorContext): EventEntity;
}

export class MassEventCreator extends EventCreator {
  override create(ctx: EventCreatorContext): EventEntity {
    const startsAt = new Date(ctx.request.startsAt);
    const endsAt = new Date(ctx.request.endsAt);
    const sessions: EventSessionInput[] =
      ctx.request.sessions && ctx.request.sessions.length > 0
        ? ctx.request.sessions
        : [
            {
              title: 'Sesión única',
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
            },
          ];

    return new EventBuilder()
      .setIdentity({
        id: ctx.id,
        organizationId: ctx.organizationId,
        publicCode: ctx.publicCode,
        now: ctx.now,
      })
      .setBasicInfo({
        name: ctx.request.name,
        description: ctx.request.description,
        type: 'mass',
        siteId: ctx.request.siteId,
        capacity: ctx.request.capacity,
      })
      .setSchedule({
        startsAt,
        endsAt,
        checkinOpensAt: ctx.request.checkinOpensAt
          ? new Date(ctx.request.checkinOpensAt)
          : new Date(startsAt.getTime() - 45 * 60_000),
        checkinClosesAt: ctx.request.checkinClosesAt
          ? new Date(ctx.request.checkinClosesAt)
          : endsAt,
      })
      .setIdentificationOptions({
        allowedIdentificationModes: ctx.request.allowedIdentificationModes ?? [
          'document',
          'institutional_code',
          'person_qr',
        ],
        confirmIdentity: ctx.request.confirmIdentity ?? true,
        allowWalkIn: ctx.request.allowWalkIn ?? true,
      })
      .setCertificateOptions({
        certificateRule: ctx.request.certificateRule ?? {
          type: 'any_attendance',
          hours: 2,
        },
        autoIssueCertificates: ctx.request.autoIssueCertificates ?? false,
      })
      .setSessions(sessions, ctx.idGenerator)
      .build();
  }
}

export class CourseEventCreator extends EventCreator {
  override create(ctx: EventCreatorContext): EventEntity {
    const startsAt = new Date(ctx.request.startsAt);
    const endsAt = new Date(ctx.request.endsAt);
    const sessions = ctx.request.sessions ?? [];

    return new EventBuilder()
      .setIdentity({
        id: ctx.id,
        organizationId: ctx.organizationId,
        publicCode: ctx.publicCode,
        now: ctx.now,
      })
      .setBasicInfo({
        name: ctx.request.name,
        description: ctx.request.description,
        type: 'course',
        siteId: ctx.request.siteId,
        capacity: ctx.request.capacity,
      })
      .setSchedule({
        startsAt,
        endsAt,
        checkinOpensAt: ctx.request.checkinOpensAt
          ? new Date(ctx.request.checkinOpensAt)
          : new Date(startsAt.getTime() - 30 * 60_000),
        checkinClosesAt: ctx.request.checkinClosesAt
          ? new Date(ctx.request.checkinClosesAt)
          : endsAt,
      })
      .setIdentificationOptions({
        allowedIdentificationModes: ctx.request.allowedIdentificationModes ?? [
          'document',
          'institutional_code',
          'person_qr',
        ],
        confirmIdentity: ctx.request.confirmIdentity ?? true,
        allowWalkIn: ctx.request.allowWalkIn ?? false,
      })
      .setCertificateOptions({
        certificateRule: ctx.request.certificateRule ?? {
          type: 'min_attendance_percent',
          minPercent: 80,
          hours: Math.max(2, sessions.length * 2),
        },
        autoIssueCertificates: ctx.request.autoIssueCertificates ?? true,
      })
      .setSessions(sessions, ctx.idGenerator)
      .build();
  }
}

export class RecurringClassCreator extends EventCreator {
  override create(ctx: EventCreatorContext): EventEntity {
    const startsAt = new Date(ctx.request.startsAt);
    const endsAt = new Date(ctx.request.endsAt);
    const sessions: EventSessionInput[] =
      ctx.request.sessions && ctx.request.sessions.length > 0
        ? ctx.request.sessions
        : [
            {
              title: 'Jornada 1',
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
            },
          ];

    return new EventBuilder()
      .setIdentity({
        id: ctx.id,
        organizationId: ctx.organizationId,
        publicCode: ctx.publicCode,
        now: ctx.now,
      })
      .setBasicInfo({
        name: ctx.request.name,
        description: ctx.request.description,
        type: 'recurring',
        siteId: ctx.request.siteId,
        capacity: ctx.request.capacity,
      })
      .setSchedule({
        startsAt,
        endsAt,
        checkinOpensAt: ctx.request.checkinOpensAt
          ? new Date(ctx.request.checkinOpensAt)
          : new Date(startsAt.getTime() - 20 * 60_000),
        checkinClosesAt: ctx.request.checkinClosesAt
          ? new Date(ctx.request.checkinClosesAt)
          : endsAt,
      })
      .setIdentificationOptions({
        allowedIdentificationModes: ctx.request.allowedIdentificationModes ?? [
          'institutional_code',
          'document',
          'person_qr',
        ],
        confirmIdentity: ctx.request.confirmIdentity ?? false,
        allowWalkIn: ctx.request.allowWalkIn ?? false,
      })
      .setCertificateOptions({
        certificateRule: ctx.request.certificateRule ?? {
          type: 'none',
          hours: 2,
        },
        autoIssueCertificates: ctx.request.autoIssueCertificates ?? false,
      })
      .setSessions(sessions, ctx.idGenerator)
      .build();
  }
}

export class EventFactory {
  private static readonly creators: Record<EventType, EventCreator> = {
    mass: new MassEventCreator(),
    course: new CourseEventCreator(),
    recurring: new RecurringClassCreator(),
  };

  static create(ctx: EventCreatorContext): EventEntity {
    const creator = EventFactory.creators[ctx.request.type];
    return creator.create(ctx);
  }
}

/**
 * Patrón State (AGENTS.md A6): gobierna las transiciones válidas del ciclo de vida del evento
 * y produce el evento de dominio correspondiente tras la transición.
 */
export type EventLifecycleAction = 'publish' | 'open' | 'close' | 'cancel';

const ALLOWED_TRANSITIONS: Record<
  EventLifecycleAction,
  { from: ReadonlyArray<EventStatus>; to: EventStatus; domainEventName: string }
> = {
  publish: {
    from: ['draft'],
    to: 'scheduled',
    domainEventName: 'event.published',
  },
  open: {
    from: ['draft', 'scheduled'],
    to: 'open',
    domainEventName: 'event.opened',
  },
  close: {
    from: ['open'],
    to: 'closed',
    domainEventName: 'event.closed',
  },
  cancel: {
    from: ['draft', 'scheduled', 'open'],
    to: 'cancelled',
    domainEventName: 'event.cancelled',
  },
};

export function assertEventEditable(event: EventEntity): void {
  if (event.status !== 'draft' && event.status !== 'scheduled') {
    throw new ConflictError(
      `No se puede editar un evento en estado "${event.status}". Solo se permite en borrador o programado.`,
    );
  }
}

export function transitionEventState(params: {
  event: EventEntity;
  action: EventLifecycleAction;
  now: Date;
  eventIdGenerator: IdGenerator;
}): {
  updated: EventEntity;
  domainEvent: DomainEvent<
    string,
    {
      eventId: string;
      organizationId: string;
      previousStatus: EventStatus;
      newStatus: EventStatus;
      autoIssueCertificates: boolean;
    }
  >;
} {
  const rule = ALLOWED_TRANSITIONS[params.action];
  if (!rule.from.includes(params.event.status)) {
    throw new ConflictError(
      `Transición de estado no permitida: no se puede ejecutar "${params.action}" desde el estado "${params.event.status}".`,
    );
  }

  const updated = hydrateEventEntity({
    ...params.event,
    status: rule.to,
    updatedAt: params.now,
  });

  const domainEvent: DomainEvent<
    string,
    {
      eventId: string;
      organizationId: string;
      previousStatus: EventStatus;
      newStatus: EventStatus;
      autoIssueCertificates: boolean;
    }
  > = {
    id: params.eventIdGenerator.nextId(),
    name: rule.domainEventName,
    occurredAt: params.now,
    organizationId: params.event.organizationId,
    payload: {
      eventId: params.event.id,
      organizationId: params.event.organizationId,
      previousStatus: params.event.status,
      newStatus: rule.to,
      autoIssueCertificates: params.event.autoIssueCertificates,
    },
  };

  return { updated, domainEvent };
}

export function toEventDto(event: EventEntity): EventDto {
  return {
    id: event.id,
    organizationId: event.organizationId,
    siteId: event.siteId,
    name: event.name,
    description: event.description,
    type: event.type,
    status: event.status,
    publicCode: event.publicCode,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    checkinOpensAt: event.checkinOpensAt.toISOString(),
    checkinClosesAt: event.checkinClosesAt.toISOString(),
    capacity: event.capacity,
    allowedIdentificationModes: [...event.allowedIdentificationModes],
    confirmIdentity: event.confirmIdentity,
    allowWalkIn: event.allowWalkIn,
    certificateRule: { ...event.certificateRule },
    autoIssueCertificates: event.autoIssueCertificates,
    sessions: event.sessions.map((s) => ({
      id: s.id,
      eventId: s.eventId,
      sessionNumber: s.sessionNumber,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
    })),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}
