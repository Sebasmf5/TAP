import {
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const notificationsSchema = pgSchema('notifications');

export const notificationTemplatesTable = notificationsSchema.table(
  'templates',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    templateKey: text('template_key').notNull(),
    subjectTemplate: text('subject_template').notNull(),
    htmlTemplate: text('html_template').notNull(),
    textTemplate: text('text_template').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_notification_templates_org_key').on(table.organizationId, table.templateKey),
  ],
);

export const notificationsTable = notificationsSchema.table(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    channel: text('channel').notNull(),
    template: text('template').notNull(),
    recipient: text('recipient').notNull(),
    subject: text('subject').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: uuid('related_entity_id'),
    deduplicationKey: text('deduplication_key').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_notifications_dedup').on(table.organizationId, table.deduplicationKey),
    index('idx_notifications_org_status').on(table.organizationId, table.status),
  ],
);
