import { index, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const reportsSchema = pgSchema('reports');

export const reportRunsTable = reportsSchema.table(
  'runs',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    requestedBy: uuid('requested_by').notNull(),
    type: text('type').notNull(),
    format: text('format').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('queued'),
    filePath: text('file_path'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [index('idx_reports_runs_org_created').on(table.organizationId, table.createdAt)],
);
