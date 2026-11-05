import type { EventDto } from '@tap/contracts';
import type {
  AuditLog,
  Clock,
  DrizzleExecutor,
  EventBus,
  IdGenerator,
} from '../../shared/index.ts';
import { EventsService } from './application/use-cases.ts';
import {
  CourseEventCreator,
  EventBuilder,
  EventCreator,
  EventFactory,
  MassEventCreator,
  RecurringClassCreator,
  assertEventEditable,
  hydrateEventEntity,
  toEventDto,
  transitionEventState,
  type EventCreatorContext,
  type EventEntity,
  type EventLifecycleAction,
  type EventSession,
} from './domain/entities.ts';
import type { EventPosterRenderer, EventsRepository } from './domain/ports.ts';
import { createEventsRoutes, type AuthenticateRequestFn } from './http/routes.ts';
import { PdfKitEventPosterRenderer } from './infrastructure/poster-renderer.ts';
import { DrizzleEventsRepository, InMemoryEventsRepository } from './infrastructure/repository.ts';
import { eventSessionsTable, eventsSchema, eventsTable } from './infrastructure/schema.ts';

export interface EventsModule {
  readonly service: EventsService;
  readonly repository: EventsRepository;
  findByPublicCode(publicCode: string): Promise<EventEntity | null>;
  findById(organizationId: string, eventId: string): Promise<EventEntity | null>;
  getEventByPublicCode(publicCode: string): Promise<EventDto | null>;
  getEventById(organizationId: string, eventId: string): Promise<EventDto | null>;
  processScheduledTransitions(): Promise<{ openedCount: number; closedCount: number }>;
  createRoutes(authenticate: AuthenticateRequestFn): ReturnType<typeof createEventsRoutes>;
}

export function createEventsModule(params: {
  db?: DrizzleExecutor;
  repository?: EventsRepository;
  posterRenderer?: EventPosterRenderer;
  idGenerator: IdGenerator;
  clock: Clock;
  eventBus: EventBus;
  auditLog: AuditLog;
  appUrl: string;
  getOrganizationName?: (organizationId: string) => Promise<string | null>;
}): EventsModule {
  const repository =
    params.repository ??
    (params.db ? new DrizzleEventsRepository(params.db) : new InMemoryEventsRepository());

  const posterRenderer = params.posterRenderer ?? new PdfKitEventPosterRenderer();

  const service = new EventsService({
    repository,
    posterRenderer,
    idGenerator: params.idGenerator,
    clock: params.clock,
    eventBus: params.eventBus,
    auditLog: params.auditLog,
    appUrl: params.appUrl,
    getOrganizationName: params.getOrganizationName,
  });

  return {
    service,
    repository,
    findByPublicCode(publicCode: string) {
      return service.findByPublicCodeInternal(publicCode);
    },
    findById(organizationId: string, eventId: string) {
      return service.findByIdInternal(organizationId, eventId);
    },
    async getEventByPublicCode(publicCode: string) {
      const event = await service.findByPublicCodeInternal(publicCode);
      return event ? toEventDto(event) : null;
    },
    async getEventById(organizationId: string, eventId: string) {
      const event = await service.findByIdInternal(organizationId, eventId);
      return event ? toEventDto(event) : null;
    },
    processScheduledTransitions() {
      return service.processScheduledLifecycleTransitions();
    },
    createRoutes(authenticate: AuthenticateRequestFn) {
      return createEventsRoutes({ service, authenticate });
    },
  };
}

export {
  CourseEventCreator,
  DrizzleEventsRepository,
  EventBuilder,
  EventCreator,
  EventFactory,
  EventsService,
  InMemoryEventsRepository,
  MassEventCreator,
  PdfKitEventPosterRenderer,
  RecurringClassCreator,
  assertEventEditable,
  createEventsRoutes,
  eventSessionsTable,
  eventsSchema,
  eventsTable,
  hydrateEventEntity,
  toEventDto,
  transitionEventState,
  type AuthenticateRequestFn,
  type EventCreatorContext,
  type EventEntity,
  type EventLifecycleAction,
  type EventPosterRenderer,
  type EventSession,
  type EventsRepository,
};
