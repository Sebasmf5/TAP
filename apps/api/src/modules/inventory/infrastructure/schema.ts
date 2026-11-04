import { index, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const inventorySchema = pgSchema('inventory');

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
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_inventory_units_org_code').on(table.organizationId, table.code),
    index('idx_inventory_units_org_site_status').on(
      table.organizationId,
      table.siteId,
      table.status,
    ),
  ],
);
