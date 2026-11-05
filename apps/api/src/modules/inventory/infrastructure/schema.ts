import { index, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const inventorySchema = pgSchema('inventory');

export const inventoryCategoriesTable = inventorySchema.table(
  'categories',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    name: text('name').notNull(),
    defaultLoanDurationHours: integer('default_loan_duration_hours').notNull().default(4),
    maxUnitsPerBorrower: integer('max_units_per_borrower').notNull().default(2),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('idx_inventory_categories_org').on(table.organizationId)],
);

export const itemModelsTable = inventorySchema.table(
  'item_models',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => inventoryCategoriesTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    codePrefix: text('code_prefix').notNull(),
    description: text('description'),
    trackingType: text('tracking_type').notNull().default('trackable'),
    loanDurationHours: integer('loan_duration_hours').notNull().default(4),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_inventory_models_org_prefix').on(table.organizationId, table.codePrefix),
    index('idx_inventory_models_org_cat').on(table.organizationId, table.categoryId),
  ],
);

export const unitsTable = inventorySchema.table(
  'units',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    siteId: uuid('site_id').notNull(),
    modelId: uuid('model_id').notNull(),
    code: text('code').notNull(),
    qrToken: text('qr_token').notNull(),
    condition: text('condition').notNull().default('good'),
    status: text('status').notNull().default('available'),
    notes: text('notes'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_inventory_units_org_code').on(table.organizationId, table.code),
    uniqueIndex('uq_inventory_units_qr_token').on(table.qrToken),
    index('idx_inventory_units_org_site_status').on(
      table.organizationId,
      table.siteId,
      table.status,
    ),
    index('idx_inventory_units_org_model_status').on(
      table.organizationId,
      table.modelId,
      table.status,
    ),
  ],
);
