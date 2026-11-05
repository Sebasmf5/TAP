import type { CertificateDto } from '@tap/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type {
  AuditLog,
  Clock,
  DrizzleExecutor,
  EventBus,
  FileStorage,
  IdGenerator,
} from '../../shared/index.ts';
import type { AttendanceRecord } from '../attendance/index.ts';
import type { EventEntity } from '../events/index.ts';
import type { Organization } from '../organizations/index.ts';
import type { Person } from '../people/index.ts';
import { CertificatesService } from './application/use-cases.ts';
import {
  AnyAttendanceStrategy,
  MinAttendancePercentStrategy,
  MinSessionsStrategy,
  NoCertificateStrategy,
  computeCheckCharacter,
  createEligibilityStrategy,
  generateCertificateCode,
  interpolateCertificateVariables,
  isValidCertificateCodeCheckDigit,
  type CertificateEntity,
  type CertificateTemplateEntity,
  type CertificateTemplateSnapshot,
  type EligibilityInput,
  type EligibilityResult,
  type EligibilityStrategy,
} from './domain/entities.ts';
import type { CertificatePdfRenderer, CertificatesRepository } from './domain/ports.ts';
import { createCertificatesRoutes, type AuthenticateRequestFn } from './http/routes.ts';

type DrizzleDb = DrizzleExecutor;
import { PdfKitCertificateRenderer } from './infrastructure/pdf-renderer.ts';
import {
  DrizzleCertificatesRepository,
  InMemoryCertificatesRepository,
} from './infrastructure/repository.ts';

export const MODULE_NAME = 'certificates' as const;

export interface CertificatesModule {
  readonly repository: CertificatesRepository;
  readonly service: CertificatesService;
  listEventCertificatesInternal(organizationId: string, eventId: string): Promise<CertificateDto[]>;
  markCertificateDelivered(
    organizationId: string,
    certificateId: string,
    deliveredAt: Date,
  ): Promise<void>;
  createRoutes(authenticate: AuthenticateRequestFn): FastifyPluginAsync;
}

export function createCertificatesModule(deps: {
  db?: DrizzleDb;
  repository?: CertificatesRepository;
  pdfRenderer?: CertificatePdfRenderer;
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
}): CertificatesModule {
  const repository =
    deps.repository ??
    (deps.db ? new DrizzleCertificatesRepository(deps.db) : new InMemoryCertificatesRepository());

  const pdfRenderer = deps.pdfRenderer ?? new PdfKitCertificateRenderer();

  const service = new CertificatesService({
    repository,
    pdfRenderer,
    fileStorage: deps.fileStorage,
    idGenerator: deps.idGenerator,
    clock: deps.clock,
    eventBus: deps.eventBus,
    auditLog: deps.auditLog,
    appUrl: deps.appUrl,
    findEventById: deps.findEventById,
    findOrganizationById: deps.findOrganizationById,
    assertFeatureEnabled: deps.assertFeatureEnabled,
    listValidAttendanceByEvent: deps.listValidAttendanceByEvent,
    findPersonById: deps.findPersonById,
    enqueueResendNotification: deps.enqueueResendNotification,
  });

  // Emisión automática al cerrar un evento si `autoIssueCertificates` está activo
  deps.eventBus.subscribe<{
    eventId: string;
    organizationId: string;
    autoIssueCertificates: boolean;
  }>('event.closed', async (domainEvent) => {
    const { eventId, organizationId, autoIssueCertificates } = domainEvent.payload;
    if (!autoIssueCertificates) {
      return;
    }

    const eventEntity = await deps.findEventById(organizationId, eventId);
    if (!eventEntity || eventEntity.certificateRule.type === 'none') {
      return;
    }

    await service.issueEventCertificatesInternal({
      organizationId,
      actorUserId: null,
      eventId,
      input: {
        hours: String(eventEntity.certificateRule.hours ?? 4),
      },
    });
  });

  return {
    repository,
    service,
    listEventCertificatesInternal(organizationId: string, eventId: string) {
      return service.listEventCertificatesInternal(organizationId, eventId);
    },
    async markCertificateDelivered(
      organizationId: string,
      certificateId: string,
      deliveredAt: Date,
    ) {
      await repository.markCertificateDelivered(organizationId, certificateId, deliveredAt);
    },
    createRoutes(authenticate: AuthenticateRequestFn) {
      return createCertificatesRoutes({ service, authenticate });
    },
  };
}

export {
  AnyAttendanceStrategy,
  CertificatesService,
  DrizzleCertificatesRepository,
  InMemoryCertificatesRepository,
  MinAttendancePercentStrategy,
  MinSessionsStrategy,
  NoCertificateStrategy,
  PdfKitCertificateRenderer,
  computeCheckCharacter,
  createEligibilityStrategy,
  generateCertificateCode,
  interpolateCertificateVariables,
  isValidCertificateCodeCheckDigit,
  type CertificateEntity,
  type CertificatePdfRenderer,
  type CertificatesRepository,
  type CertificateTemplateEntity,
  type CertificateTemplateSnapshot,
  type EligibilityInput,
  type EligibilityResult,
  type EligibilityStrategy,
};
