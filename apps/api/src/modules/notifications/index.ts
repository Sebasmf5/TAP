import type { FeatureKey, NotificationDto } from '@tap/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type {
  AuditLog,
  Clock,
  DrizzleExecutor,
  EventBus,
  IdGenerator,
  JobQueue,
} from '../../shared/index.ts';
import { NotificationsService, type EnqueueNotificationInput } from './application/use-cases.ts';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  interpolateNotificationTemplate,
  type NotificationChannel,
  type NotificationRecord,
  type OutboundNotificationMessage,
} from './domain/entities.ts';
import type { NotificationsRepository } from './domain/ports.ts';
import { createNotificationsRoutes, type AuthenticateRequestFn } from './http/routes.ts';
import { EmailNotificationChannel, LogNotificationChannel } from './infrastructure/channels.ts';
import {
  DrizzleNotificationsRepository,
  InMemoryNotificationsRepository,
} from './infrastructure/repository.ts';

type DrizzleDb = DrizzleExecutor;

export const MODULE_NAME = 'notifications' as const;

export interface CertificateIssuedEventPayload {
  organizationId: string;
  certificateId: string;
  certificateCode: string;
  eventId: string;
  eventName: string;
  personId: string;
  holderName: string;
  recipientEmail: string | null;
  hours: string;
  organizationName: string;
  verificationUrl: string;
}

export interface NotificationsModule {
  readonly repository: NotificationsRepository;
  readonly service: NotificationsService;
  readonly channel: NotificationChannel;
  registerWorkers(): Promise<void>;
  enqueueNotification(
    input: EnqueueNotificationInput,
  ): Promise<{ created: boolean; notification: NotificationDto }>;
  createRoutes(authenticate: AuthenticateRequestFn): FastifyPluginAsync;
}

export function createNotificationsModule(deps: {
  db?: DrizzleDb;
  repository?: NotificationsRepository;
  channel?: NotificationChannel;
  jobQueue: JobQueue;
  eventBus: EventBus;
  idGenerator: IdGenerator;
  clock: Clock;
  auditLog: AuditLog;
  onCertificateDelivered?: (
    organizationId: string,
    certificateId: string,
    deliveredAt: Date,
  ) => Promise<void>;
  assertFeatureEnabled?: (organizationId: string, feature: FeatureKey) => Promise<void>;
  listMarketingRecipients?: (organizationId: string) => Promise<{
    consentedRecipients: Array<{
      personId: string;
      fullName: string;
      email: string;
      qrToken: string;
    }>;
    skippedWithoutConsentCount: number;
  }>;
  optOutMarketingByQrToken?: (
    organizationId: string,
    qrToken: string,
    ipHash?: string | null,
  ) => Promise<boolean>;
  getOrganizationName?: (organizationId: string) => Promise<string | null>;
  appUrl?: string;
}): NotificationsModule {
  const repository =
    deps.repository ??
    (deps.db ? new DrizzleNotificationsRepository(deps.db) : new InMemoryNotificationsRepository());

  const channel = deps.channel ?? new LogNotificationChannel();

  const service = new NotificationsService({
    repository,
    channel,
    jobQueue: deps.jobQueue,
    idGenerator: deps.idGenerator,
    clock: deps.clock,
    auditLog: deps.auditLog,
    onCertificateDelivered: deps.onCertificateDelivered,
    assertFeatureEnabled: deps.assertFeatureEnabled,
    listMarketingRecipients: deps.listMarketingRecipients,
    optOutMarketingByQrToken: deps.optOutMarketingByQrToken,
    getOrganizationName: deps.getOrganizationName,
    appUrl: deps.appUrl,
  });

  // Suscripción a eventos de dominio de certificados
  deps.eventBus.subscribe<CertificateIssuedEventPayload>('certificate.issued', async (event) => {
    const payload = event.payload;
    if (!payload.recipientEmail) {
      return;
    }

    await service.enqueueNotification({
      organizationId: payload.organizationId,
      template: 'certificate_issued',
      recipient: payload.recipientEmail,
      variables: {
        holder_name: payload.holderName,
        event_name: payload.eventName,
        hours: payload.hours,
        certificate_code: payload.certificateCode,
        organization_name: payload.organizationName,
        verification_url: payload.verificationUrl,
      },
      relatedEntityType: 'certificate',
      relatedEntityId: payload.certificateId,
      deduplicationKey: `certificate_issued:${payload.certificateId}`,
    });
  });

  // Suscripción a eventos de dominio de préstamos (Fase 5)
  deps.eventBus.subscribe<{
    organizationId: string;
    loanId: string;
    borrowerName: string;
    recipientEmail: string | null;
    itemName: string;
    unitCode: string;
    dueAtFormatted: string;
    organizationName: string;
  }>('loan.delivered', async (event) => {
    const p = event.payload;
    if (!p.recipientEmail) return;
    await service.enqueueNotification({
      organizationId: p.organizationId,
      template: 'loan_delivered',
      recipient: p.recipientEmail,
      variables: {
        borrower_name: p.borrowerName,
        item_name: p.itemName,
        unit_code: p.unitCode,
        due_at: p.dueAtFormatted,
        organization_name: p.organizationName,
      },
      relatedEntityType: 'loan',
      relatedEntityId: p.loanId,
      deduplicationKey: `loan_delivered:${p.loanId}`,
    });
  });

  deps.eventBus.subscribe<{
    organizationId: string;
    loanId: string;
    borrowerName: string;
    recipientEmail: string | null;
    itemName: string;
    unitCode: string;
    dueAtFormatted: string;
    organizationName: string;
  }>('loan.overdue', async (event) => {
    const p = event.payload;
    if (!p.recipientEmail) return;
    await service.enqueueNotification({
      organizationId: p.organizationId,
      template: 'loan_overdue',
      recipient: p.recipientEmail,
      variables: {
        borrower_name: p.borrowerName,
        item_name: p.itemName,
        unit_code: p.unitCode,
        due_at: p.dueAtFormatted,
        organization_name: p.organizationName,
      },
      relatedEntityType: 'loan',
      relatedEntityId: p.loanId,
      deduplicationKey: `loan_overdue:${p.loanId}`,
    });
  });

  deps.eventBus.subscribe<{
    organizationId: string;
    loanId: string;
    borrowerName: string;
    recipientEmail: string | null;
    itemName: string;
    unitCode: string;
    returnedAtFormatted: string;
    organizationName: string;
  }>('loan.returned', async (event) => {
    const p = event.payload;
    if (!p.recipientEmail) return;
    await service.enqueueNotification({
      organizationId: p.organizationId,
      template: 'loan_returned',
      recipient: p.recipientEmail,
      variables: {
        borrower_name: p.borrowerName,
        item_name: p.itemName,
        unit_code: p.unitCode,
        returned_at: p.returnedAtFormatted,
        organization_name: p.organizationName,
      },
      relatedEntityType: 'loan',
      relatedEntityId: p.loanId,
      deduplicationKey: `loan_returned:${p.loanId}`,
    });
  });

  return {
    repository,
    service,
    channel,
    registerWorkers: () => service.registerWorkers(),
    enqueueNotification: (input) => service.enqueueNotification(input),
    createRoutes: (authenticate) => createNotificationsRoutes({ service, authenticate }),
  };
}

export {
  DEFAULT_NOTIFICATION_TEMPLATES,
  DrizzleNotificationsRepository,
  EmailNotificationChannel,
  InMemoryNotificationsRepository,
  interpolateNotificationTemplate,
  LogNotificationChannel,
  NotificationsService,
  type EnqueueNotificationInput,
  type NotificationChannel,
  type NotificationRecord,
  type NotificationsRepository,
  type OutboundNotificationMessage,
};
