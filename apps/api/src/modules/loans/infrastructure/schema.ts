import { index, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const loansSchema = pgSchema('loans');

export const loansTable = loansSchema.table(
  'loans',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    siteId: uuid('site_id').notNull(),
    personId: uuid('person_id').notNull(),
    status: text('status').notNull().default('pending_delivery'),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('idx_loans_org_status').on(table.organizationId, table.status)],
);
