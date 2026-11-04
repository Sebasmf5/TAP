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

export const notificationsTable = notificationsSchema.table(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    channel: text('channel').notNull(),
    template: text('template').notNull(),
    recipient: text('recipient').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    deduplicationKey: text('deduplication_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_notifications_dedup').on(table.organizationId, table.deduplicationKey),
    index('idx_notifications_org_status').on(table.organizationId, table.status),
  ],
);
