import type { DocumentType, PersonType } from '@tap/contracts';
import type {
  AuditLog,
  Clock,
  DrizzleExecutor,
  EventBus,
  IdGenerator,
} from '../../shared/index.ts';
import type { EventEntity } from '../events/index.ts';
import type { Organization } from '../organizations/index.ts';
import type { Person } from '../people/index.ts';
import { AttendanceService } from './application/use-cases.ts';
import {
  DocumentIdentificationStrategy,
  IdentificationStrategyRegistry,
  InstitutionalCodeIdentificationStrategy,
  ManualStaffIdentificationStrategy,
  PersonQrIdentificationStrategy,
  computeMedian,
  selectActiveEventSession,
  type AttendanceRecord,
  type CheckinIdentificationMode,
  type IdentificationRequest,
  type IdentificationStrategy,
  type PersonLookupGateway,
  type ResolvedPersonIdentity,
} from './domain/entities.ts';
import type { AttendanceRepository, InsertCheckinResult } from './domain/ports.ts';
import { createAttendanceRoutes, type AuthenticateRequestFn } from './http/routes.ts';
import {
  DrizzleAttendanceRepository,
  InMemoryAttendanceRepository,
} from './infrastructure/repository.ts';
import { attendanceRecordsTable, attendanceSchema } from './infrastructure/schema.ts';

export interface AttendanceModule {
  readonly service: AttendanceService;
  readonly repository: AttendanceRepository;
  listValidByEvent(organizationId: string, eventId: string): Promise<AttendanceRecord[]>;
  createRoutes(authenticate: AuthenticateRequestFn): ReturnType<typeof createAttendanceRoutes>;
}

export function createAttendanceModule(params: {
  db?: DrizzleExecutor;
  repository?: AttendanceRepository;
  idGenerator: IdGenerator;
  clock: Clock;
  eventBus: EventBus;
  auditLog: AuditLog;
  findEventByPublicCode: (publicCode: string) => Promise<EventEntity | null>;
  findEventById: (organizationId: string, eventId: string) => Promise<EventEntity | null>;
  findOrganizationById: (organizationId: string) => Promise<Organization | null>;
  assertFeatureEnabled: (organizationId: string, feature: 'attendance') => Promise<void>;
  personGateway: PersonLookupGateway & {
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
    }) => Promise<Person>;
  };
  enqueuePreregistrationNotification?: (params: {
    organizationId: string;
    event: EventEntity;
    organizationName: string;
    person: Person;
    recipientEmail: string;
  }) => Promise<void>;
}): AttendanceModule {
  const repository =
    params.repository ??
    (params.db ? new DrizzleAttendanceRepository(params.db) : new InMemoryAttendanceRepository());

  const service = new AttendanceService({
    repository,
    idGenerator: params.idGenerator,
    clock: params.clock,
    eventBus: params.eventBus,
    auditLog: params.auditLog,
    findEventByPublicCode: params.findEventByPublicCode,
    findEventById: params.findEventById,
    findOrganizationById: params.findOrganizationById,
    assertFeatureEnabled: params.assertFeatureEnabled,
    personGateway: params.personGateway,
    enqueuePreregistrationNotification: params.enqueuePreregistrationNotification,
  });

  for (const eventName of ['event.published', 'event.opened', 'event.closed', 'event.cancelled']) {
    params.eventBus.subscribe(eventName, () => {
      service.invalidateEventCache();
    });
  }

  return {
    service,
    repository,
    listValidByEvent(organizationId: string, eventId: string) {
      return service.listValidByEventInternal(organizationId, eventId);
    },
    createRoutes(authenticate: AuthenticateRequestFn) {
      return createAttendanceRoutes({ service, authenticate });
    },
  };
}

export {
  AttendanceService,
  DocumentIdentificationStrategy,
  DrizzleAttendanceRepository,
  IdentificationStrategyRegistry,
  InMemoryAttendanceRepository,
  InstitutionalCodeIdentificationStrategy,
  ManualStaffIdentificationStrategy,
  PersonQrIdentificationStrategy,
  attendanceRecordsTable,
  attendanceSchema,
  computeMedian,
  createAttendanceRoutes,
  selectActiveEventSession,
  type AttendanceRecord,
  type AttendanceRepository,
  type AuthenticateRequestFn,
  type CheckinIdentificationMode,
  type IdentificationRequest,
  type IdentificationStrategy,
  type InsertCheckinResult,
  type PersonLookupGateway,
  type ResolvedPersonIdentity,
};
