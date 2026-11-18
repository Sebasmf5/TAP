import type {
  FeatureKey,
  ListNotificationsResponse,
  MarketingCampaignRequest,
  MarketingCampaignResponse,
  NotificationDto,
  NotificationStatus,
  NotificationTemplateKey,
} from '@tap/contracts';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type AuditLog,
  type Clock,
  type IdGenerator,
  type JobQueue,
  type TenantContext,
} from '../../../shared/index.ts';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  interpolateNotificationTemplate,
  isWithinLaw2300Schedule,
  type NotificationChannel,
  type NotificationRecord,
} from '../domain/entities.ts';
import type { NotificationsRepository } from '../domain/ports.ts';

type StaffActor = TenantContext;

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
      'Solo administradores u operadores pueden gestionar o reintentar envíos.',
    );
  }
  return orgId;
}

export function toNotificationDto(record: NotificationRecord): NotificationDto {
  return {
    id: record.id,
    organizationId: record.organizationId,
    channel: record.channel,
    template: record.template,
    recipient: record.recipient,
    subject: record.subject,
    status: record.status,
    attempts: record.attempts,
    lastError: record.lastError,
    relatedEntityType: record.relatedEntityType,
    relatedEntityId: record.relatedEntityId,
    deduplicationKey: record.deduplicationKey,
    sentAt: record.sentAt ? record.sentAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

export interface EnqueueNotificationInput {
  organizationId: string;
  template: NotificationTemplateKey;
  recipient: string;
  variables: Record<string, unknown>;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  deduplicationKey: string;
}

export interface DeliverJobPayload {
  organizationId: string;
  notificationId: string;
}

export const NOTIFICATIONS_DELIVER_QUEUE = 'notifications.deliver';

export class NotificationsService {
  private readonly repository: NotificationsRepository;
  private readonly channel: NotificationChannel;
  private readonly jobQueue: JobQueue;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly auditLog: AuditLog;
  private readonly onCertificateDelivered?: (
    organizationId: string,
    certificateId: string,
    deliveredAt: Date,
  ) => Promise<void>;
  private readonly assertFeatureEnabled?: (
    organizationId: string,
    feature: FeatureKey,
  ) => Promise<void>;
  private readonly listMarketingRecipients?: (organizationId: string) => Promise<{
    consentedRecipients: Array<{
      personId: string;
      fullName: string;
      email: string;
      qrToken: string;
    }>;
    skippedWithoutConsentCount: number;
  }>;
  private readonly optOutMarketingByQrToken?: (
    organizationId: string,
    qrToken: string,
    ipHash?: string | null,
  ) => Promise<boolean>;
  private readonly getOrganizationName?: (organizationId: string) => Promise<string | null>;
  private readonly appUrl: string;

  public constructor(deps: {
    repository: NotificationsRepository;
    channel: NotificationChannel;
    jobQueue: JobQueue;
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
  }) {
    this.repository = deps.repository;
    this.channel = deps.channel;
    this.jobQueue = deps.jobQueue;
    this.idGenerator = deps.idGenerator;
    this.clock = deps.clock;
    this.auditLog = deps.auditLog;
    this.onCertificateDelivered = deps.onCertificateDelivered;
    this.assertFeatureEnabled = deps.assertFeatureEnabled;
    this.listMarketingRecipients = deps.listMarketingRecipients;
    this.optOutMarketingByQrToken = deps.optOutMarketingByQrToken;
    this.getOrganizationName = deps.getOrganizationName;
    this.appUrl = (deps.appUrl ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  public async registerWorkers(): Promise<void> {
    await this.jobQueue.registerWorker<DeliverJobPayload>(
      NOTIFICATIONS_DELIVER_QUEUE,
      async (job) => {
        await this.deliverNotification(job.data.organizationId, job.data.notificationId);
      },
      { concurrency: 4 },
    );
  }

  public async enqueueNotification(
    input: EnqueueNotificationInput,
  ): Promise<{ created: boolean; notification: NotificationDto }> {
    const customTemplate = await this.repository.getTemplateOverride(
      input.organizationId,
      input.template,
    );
    const baseTemplate = customTemplate ?? DEFAULT_NOTIFICATION_TEMPLATES[input.template];
    const subject = interpolateNotificationTemplate(baseTemplate.subjectTemplate, input.variables);

    const now = this.clock.now();
    const { created, record } = await this.repository.insertIfNotDuplicate({
      id: this.idGenerator.nextId(),
      organizationId: input.organizationId,
      channel: this.channel.channelType,
      template: input.template,
      recipient: input.recipient,
      subject,
      payload: input.variables,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      deduplicationKey: input.deduplicationKey,
      createdAt: now,
    });

    if (created) {
      if (this.jobQueue.isReady()) {
        await this.jobQueue.enqueue<DeliverJobPayload>(
          NOTIFICATIONS_DELIVER_QUEUE,
          {
            organizationId: record.organizationId,
            notificationId: record.id,
          },
          {
            singletonKey: `${record.organizationId}:${record.id}`,
            retryLimit: 3,
            retryDelaySeconds: 15,
          },
        );
      } else {
        await this.deliverNotification(record.organizationId, record.id);
      }
    }

    const updated = (await this.repository.findById(record.organizationId, record.id)) ?? record;
    return { created, notification: toNotificationDto(updated) };
  }

  public async deliverNotification(
    organizationId: string,
    notificationId: string,
  ): Promise<NotificationRecord | null> {
    const record = await this.repository.findById(organizationId, notificationId);
    if (!record) return null;
    if (record.status === 'sent') return record;

    const customTemplate = await this.repository.getTemplateOverride(
      organizationId,
      record.template,
    );
    const baseTemplate = customTemplate ?? DEFAULT_NOTIFICATION_TEMPLATES[record.template];

    const subject = interpolateNotificationTemplate(baseTemplate.subjectTemplate, record.payload);
    const html = interpolateNotificationTemplate(baseTemplate.htmlTemplate, record.payload);
    const text = interpolateNotificationTemplate(baseTemplate.textTemplate, record.payload);

    try {
      await this.channel.send({
        to: record.recipient,
        subject,
        html,
        text,
        metadata: {
          notificationId: record.id,
          organizationId: record.organizationId,
          template: record.template,
        },
      });

      const now = this.clock.now();
      const updated = await this.repository.markSent(organizationId, record.id, now);

      if (
        record.template === 'certificate_issued' &&
        record.relatedEntityType === 'certificate' &&
        record.relatedEntityId &&
        this.onCertificateDelivered
      ) {
        await this.onCertificateDelivered(organizationId, record.relatedEntityId, now);
      }

      return updated;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Fallo desconocido al enviar mensaje';
      return this.repository.markFailed(organizationId, record.id, errorMsg);
    }
  }

  public async listNotifications(
    actor: StaffActor,
    filters?: { status?: NotificationStatus },
  ): Promise<ListNotificationsResponse> {
    const orgId = assertStaffOrganization(actor);
    const all = await this.repository.listByOrganization(orgId);
    const filtered = filters?.status ? all.filter((item) => item.status === filters.status) : all;

    let sentCount = 0;
    let queuedCount = 0;
    let failedCount = 0;
    for (const item of all) {
      if (item.status === 'sent') sentCount += 1;
      else if (item.status === 'queued') queuedCount += 1;
      else if (item.status === 'failed') failedCount += 1;
    }

    return {
      totalCount: all.length,
      sentCount,
      queuedCount,
      failedCount,
      items: filtered.map(toNotificationDto),
    };
  }

  public async retryNotification(
    actor: StaffActor,
    notificationId: string,
  ): Promise<NotificationDto> {
    const orgId = assertOperatorOrAdmin(actor);
    const existing = await this.repository.findById(orgId, notificationId);
    if (!existing) {
      throw new NotFoundError('No se encontró la notificación solicitada.');
    }

    await this.repository.resetForRetry(orgId, notificationId);
    const delivered = await this.deliverNotification(orgId, notificationId);

    await this.auditLog.record({
      organizationId: orgId,
      actorUserId: actor.userId,
      action: 'notification.retried',
      targetType: 'notification',
      targetId: notificationId,
      metadata: {
        template: existing.template,
        status: delivered?.status ?? 'queued',
      },
    });

    return toNotificationDto(delivered ?? existing);
  }

  /**
   * Envía una campaña publicitaria de la entidad suscrita únicamente a participantes
   * con consentimiento expreso vigente (Ley 1581 de 2012 y Ley 2300 de 2023).
   */
  public async sendMarketingCampaign(
    actor: StaffActor,
    input: MarketingCampaignRequest,
  ): Promise<MarketingCampaignResponse> {
    const orgId = assertOperatorOrAdmin(actor);
    if (this.assertFeatureEnabled) {
      await this.assertFeatureEnabled(orgId, 'marketing');
    }

    const sentAt = this.clock.now();
    if (!isWithinLaw2300Schedule(sentAt)) {
      throw new ValidationError(
        'Por la Ley 2300 de 2023, las campañas publicitarias solo pueden enviarse de lunes a viernes (7:00 a. m. - 7:00 p. m.) y sábados (8:00 a. m. - 3:00 p. m.) hora Colombia.',
      );
    }

    const recipientsInfo = this.listMarketingRecipients
      ? await this.listMarketingRecipients(orgId)
      : { consentedRecipients: [], skippedWithoutConsentCount: 0 };

    const orgName = (await this.getOrganizationName?.(orgId)) ?? 'Tap';
    const campaignKey = this.idGenerator.nextId();
    const ctaBlock =
      input.ctaUrl && input.ctaLabel
        ? `<a href="${input.ctaUrl}" style="display:inline-block;padding:10px 16px;background:#533afd;color:#ffffff;text-decoration:none;border-radius:4px;">${input.ctaLabel}</a>`
        : input.ctaUrl
          ? `<a href="${input.ctaUrl}">${input.ctaUrl}</a>`
          : '';

    for (const recipient of recipientsInfo.consentedRecipients) {
      const unsubscribeUrl = `${this.appUrl}/api/v1/public/marketing-unsubscribe?org=${encodeURIComponent(orgId)}&token=${encodeURIComponent(recipient.qrToken)}`;
      await this.enqueueNotification({
        organizationId: orgId,
        template: 'marketing_campaign',
        recipient: recipient.email,
        variables: {
          holder_name: recipient.fullName,
          organization_name: orgName,
          campaign_subject: input.subject,
          campaign_message: input.message,
          cta_block: ctaBlock,
          cta_url: input.ctaUrl ?? '',
          unsubscribe_url: unsubscribeUrl,
        },
        relatedEntityType: 'marketing_campaign',
        relatedEntityId: campaignKey,
        deduplicationKey: `marketing:${campaignKey}:${recipient.personId}`,
      });
    }

    await this.auditLog.record({
      organizationId: orgId,
      actorUserId: actor.userId,
      action: 'notifications.marketing_campaign_queued',
      targetType: 'marketing_campaign',
      targetId: campaignKey,
      metadata: {
        recipientsCount: recipientsInfo.consentedRecipients.length,
        skippedWithoutConsentCount: recipientsInfo.skippedWithoutConsentCount,
      },
    });

    return {
      recipientsCount: recipientsInfo.consentedRecipients.length,
      skippedWithoutConsentCount: recipientsInfo.skippedWithoutConsentCount,
      sentAt: sentAt.toISOString(),
    };
  }

  public async unsubscribeMarketingRecipient(params: {
    organizationId: string;
    qrToken: string;
    ip?: string;
  }): Promise<boolean> {
    if (!this.optOutMarketingByQrToken) return false;
    return this.optOutMarketingByQrToken(params.organizationId, params.qrToken, params.ip ?? null);
  }
}
