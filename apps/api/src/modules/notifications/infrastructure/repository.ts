import type {
  NotificationChannelType,
  NotificationStatus,
  NotificationTemplateKey,
} from '@tap/contracts';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DrizzleExecutor } from '../../../shared/index.ts';
import type { NotificationRecord, NotificationTemplateRecord } from '../domain/entities.ts';

type DrizzleDb = DrizzleExecutor;
import type { InsertNotificationInput, NotificationsRepository } from '../domain/ports.ts';
import { notificationTemplatesTable, notificationsTable } from './schema.ts';

function mapNotificationRow(row: typeof notificationsTable.$inferSelect): NotificationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    channel: row.channel as NotificationChannelType,
    template: row.template as NotificationTemplateKey,
    recipient: row.recipient,
    subject: row.subject,
    payload: row.payload ?? {},
    status: row.status as NotificationStatus,
    attempts: row.attempts,
    lastError: row.lastError ?? null,
    relatedEntityType: row.relatedEntityType ?? null,
    relatedEntityId: row.relatedEntityId ?? null,
    deduplicationKey: row.deduplicationKey,
    sentAt: row.sentAt ?? null,
    createdAt: row.createdAt,
  };
}

export class DrizzleNotificationsRepository implements NotificationsRepository {
  private readonly db: DrizzleDb;

  public constructor(db: DrizzleDb) {
    this.db = db;
  }

  public async insertIfNotDuplicate(
    input: InsertNotificationInput,
  ): Promise<{ created: boolean; record: NotificationRecord }> {
    const inserted = await this.db
      .insert(notificationsTable)
      .values({
        id: input.id,
        organizationId: input.organizationId,
        channel: input.channel,
        template: input.template,
        recipient: input.recipient,
        subject: input.subject,
        payload: input.payload,
        status: 'queued',
        attempts: 0,
        lastError: null,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        deduplicationKey: input.deduplicationKey,
        sentAt: null,
        createdAt: input.createdAt,
      })
      .onConflictDoNothing({
        target: [notificationsTable.organizationId, notificationsTable.deduplicationKey],
      })
      .returning();

    const first = inserted[0];
    if (first) {
      return { created: true, record: mapNotificationRow(first) };
    }

    const existing = await this.db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.organizationId, input.organizationId),
          eq(notificationsTable.deduplicationKey, input.deduplicationKey),
        ),
      )
      .limit(1);

    if (!existing[0]) {
      throw new Error('Inconsistencia al recuperar notificación deduplicada');
    }

    return { created: false, record: mapNotificationRow(existing[0]) };
  }

  public async findById(organizationId: string, id: string): Promise<NotificationRecord | null> {
    const rows = await this.db
      .select()
      .from(notificationsTable)
      .where(
        and(eq(notificationsTable.organizationId, organizationId), eq(notificationsTable.id, id)),
      )
      .limit(1);
    return rows[0] ? mapNotificationRow(rows[0]) : null;
  }

  public async listByOrganization(
    organizationId: string,
    filters?: { status?: NotificationStatus },
  ): Promise<NotificationRecord[]> {
    const conditions = [eq(notificationsTable.organizationId, organizationId)];
    if (filters?.status) {
      conditions.push(eq(notificationsTable.status, filters.status));
    }

    const rows = await this.db
      .select()
      .from(notificationsTable)
      .where(and(...conditions))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(200);

    return rows.map(mapNotificationRow);
  }

  public async markSent(
    organizationId: string,
    id: string,
    sentAt: Date,
  ): Promise<NotificationRecord | null> {
    const rows = await this.db
      .update(notificationsTable)
      .set({
        status: 'sent',
        sentAt,
        attempts: sql`${notificationsTable.attempts} + 1`,
        lastError: null,
      })
      .where(
        and(eq(notificationsTable.organizationId, organizationId), eq(notificationsTable.id, id)),
      )
      .returning();
    return rows[0] ? mapNotificationRow(rows[0]) : null;
  }

  public async markFailed(
    organizationId: string,
    id: string,
    errorMessage: string,
  ): Promise<NotificationRecord | null> {
    const rows = await this.db
      .update(notificationsTable)
      .set({
        status: 'failed',
        attempts: sql`${notificationsTable.attempts} + 1`,
        lastError: errorMessage,
      })
      .where(
        and(eq(notificationsTable.organizationId, organizationId), eq(notificationsTable.id, id)),
      )
      .returning();
    return rows[0] ? mapNotificationRow(rows[0]) : null;
  }

  public async resetForRetry(
    organizationId: string,
    id: string,
  ): Promise<NotificationRecord | null> {
    const rows = await this.db
      .update(notificationsTable)
      .set({
        status: 'queued',
        lastError: null,
      })
      .where(
        and(eq(notificationsTable.organizationId, organizationId), eq(notificationsTable.id, id)),
      )
      .returning();
    return rows[0] ? mapNotificationRow(rows[0]) : null;
  }

  public async getTemplateOverride(
    organizationId: string,
    templateKey: NotificationTemplateKey,
  ): Promise<NotificationTemplateRecord | null> {
    const rows = await this.db
      .select()
      .from(notificationTemplatesTable)
      .where(
        and(
          eq(notificationTemplatesTable.organizationId, organizationId),
          eq(notificationTemplatesTable.templateKey, templateKey),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organizationId,
      templateKey: row.templateKey as NotificationTemplateKey,
      subjectTemplate: row.subjectTemplate,
      htmlTemplate: row.htmlTemplate,
      textTemplate: row.textTemplate,
      updatedAt: row.updatedAt,
    };
  }
}

export class InMemoryNotificationsRepository implements NotificationsRepository {
  private readonly records = new Map<string, NotificationRecord>();
  private readonly templates = new Map<string, NotificationTemplateRecord>();

  public async insertIfNotDuplicate(
    input: InsertNotificationInput,
  ): Promise<{ created: boolean; record: NotificationRecord }> {
    for (const existing of this.records.values()) {
      if (
        existing.organizationId === input.organizationId &&
        existing.deduplicationKey === input.deduplicationKey
      ) {
        return { created: false, record: { ...existing } };
      }
    }

    const record: NotificationRecord = {
      id: input.id,
      organizationId: input.organizationId,
      channel: input.channel,
      template: input.template,
      recipient: input.recipient,
      subject: input.subject,
      payload: { ...input.payload },
      status: 'queued',
      attempts: 0,
      lastError: null,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      deduplicationKey: input.deduplicationKey,
      sentAt: null,
      createdAt: input.createdAt,
    };
    this.records.set(record.id, record);
    return { created: true, record: { ...record } };
  }

  public async findById(organizationId: string, id: string): Promise<NotificationRecord | null> {
    const found = this.records.get(id);
    if (!found || found.organizationId !== organizationId) return null;
    return { ...found };
  }

  public async listByOrganization(
    organizationId: string,
    filters?: { status?: NotificationStatus },
  ): Promise<NotificationRecord[]> {
    return Array.from(this.records.values())
      .filter(
        (r) =>
          r.organizationId === organizationId && (!filters?.status || r.status === filters.status),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({ ...r }));
  }

  public async markSent(
    organizationId: string,
    id: string,
    sentAt: Date,
  ): Promise<NotificationRecord | null> {
    const found = this.records.get(id);
    if (!found || found.organizationId !== organizationId) return null;
    const updated: NotificationRecord = {
      ...found,
      status: 'sent',
      sentAt,
      attempts: found.attempts + 1,
      lastError: null,
    };
    this.records.set(id, updated);
    return { ...updated };
  }

  public async markFailed(
    organizationId: string,
    id: string,
    errorMessage: string,
  ): Promise<NotificationRecord | null> {
    const found = this.records.get(id);
    if (!found || found.organizationId !== organizationId) return null;
    const updated: NotificationRecord = {
      ...found,
      status: 'failed',
      attempts: found.attempts + 1,
      lastError: errorMessage,
    };
    this.records.set(id, updated);
    return { ...updated };
  }

  public async resetForRetry(
    organizationId: string,
    id: string,
  ): Promise<NotificationRecord | null> {
    const found = this.records.get(id);
    if (!found || found.organizationId !== organizationId) return null;
    const updated: NotificationRecord = {
      ...found,
      status: 'queued',
      lastError: null,
    };
    this.records.set(id, updated);
    return { ...updated };
  }

  public async getTemplateOverride(
    organizationId: string,
    templateKey: NotificationTemplateKey,
  ): Promise<NotificationTemplateRecord | null> {
    const key = `${organizationId}:${templateKey}`;
    return this.templates.get(key) ?? null;
  }
}
