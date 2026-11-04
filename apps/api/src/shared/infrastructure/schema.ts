import { index, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const sharedSchema = pgSchema('shared');

export const auditLogsTable = sharedSchema.table(
  'audit_logs',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id'),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text('ip_hash'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    index('idx_audit_logs_org_occurred').on(table.organizationId, table.occurredAt),
    index('idx_audit_logs_action').on(table.action),
  ],
);
