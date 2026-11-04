import { integer, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const organizationsSchema = pgSchema('organizations');

export const organizationsTable = organizationsSchema.table(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    type: text('type').notNull(),
    plan: text('plan').notNull().default('pilot'),
    features: jsonb('features').$type<Record<string, boolean>>().notNull().default({}),
    timezone: text('timezone').notNull().default('America/Bogota'),
    retentionDays: integer('retention_days').notNull().default(365),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_organizations_slug').on(table.slug)],
);
