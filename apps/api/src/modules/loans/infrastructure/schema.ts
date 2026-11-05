import { boolean, index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const loansSchema = pgSchema('loans');

export const lendingPointsTable = loansSchema.table(
  'lending_points',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    siteId: uuid('site_id').notNull(),
    name: text('name').notNull(),
    publicCode: text('public_code').notNull(),
    isOpen: boolean('is_open').notNull().default(true),
    requireOperatorApproval: boolean('require_operator_approval').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_lending_points_public_code').on(table.publicCode),
    index('idx_lending_points_org_site').on(table.organizationId, table.siteId),
  ],
);

export const loansTable = loansSchema.table(
  'loans',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    siteId: uuid('site_id').notNull(),
    lendingPointId: uuid('lending_point_id').references(() => lendingPointsTable.id, {
      onDelete: 'set null',
    }),
    personId: uuid('person_id').notNull(),
    unitId: uuid('unit_id').notNull(),
    modelId: uuid('model_id').notNull(),
    status: text('status').notNull().default('pending_delivery'),
    conditionOut: text('condition_out').notNull().default('good'),
    conditionIn: text('condition_in'),
    signaturePath: text('signature_path').notNull().default(''),
    signatureSha256: text('signature_sha256').notNull().default(''),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    returnedAt: timestamp('returned_at', { withTimezone: true, mode: 'date' }),
    returnNotes: text('return_notes'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_loans_org_idempotency').on(table.organizationId, table.idempotencyKey),
    index('idx_loans_org_status').on(table.organizationId, table.status),
    index('idx_loans_org_person_status').on(table.organizationId, table.personId, table.status),
    index('idx_loans_org_unit_status').on(table.organizationId, table.unitId, table.status),
  ],
);
