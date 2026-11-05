import type { NotificationStatus, NotificationTemplateKey } from '@tap/contracts';
import type { NotificationRecord, NotificationTemplateRecord } from './entities.ts';

export interface InsertNotificationInput {
  id: string;
  organizationId: string;
  channel: 'email' | 'log';
  template: NotificationTemplateKey;
  recipient: string;
  subject: string;
  payload: Record<string, unknown>;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  deduplicationKey: string;
  createdAt: Date;
}

export interface NotificationsRepository {
  insertIfNotDuplicate(
    input: InsertNotificationInput,
  ): Promise<{ created: boolean; record: NotificationRecord }>;
  findById(organizationId: string, id: string): Promise<NotificationRecord | null>;
  listByOrganization(
    organizationId: string,
    filters?: { status?: NotificationStatus },
  ): Promise<NotificationRecord[]>;
  markSent(organizationId: string, id: string, sentAt: Date): Promise<NotificationRecord | null>;
  markFailed(
    organizationId: string,
    id: string,
    errorMessage: string,
  ): Promise<NotificationRecord | null>;
  resetForRetry(organizationId: string, id: string): Promise<NotificationRecord | null>;
  getTemplateOverride(
    organizationId: string,
    templateKey: NotificationTemplateKey,
  ): Promise<NotificationTemplateRecord | null>;
}
