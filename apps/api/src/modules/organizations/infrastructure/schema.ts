import type { FeatureFlags } from '@tap/contracts';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const organizationsSchema = pgSchema('organizations');

export const organizationsTable = organizationsSchema.table(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    type: text('type').notNull(),
    plan: text('plan').notNull().default('pilot'),
    features: jsonb('features').$type<FeatureFlags>().notNull(),
    logoUrl: text('logo_url'),
    timezone: text('timezone').notNull().default('America/Bogota'),
    allowedEmailDomains: jsonb('allowed_email_domains').$type<string[]>().notNull().default([]),
    dataConsentVersion: text('data_consent_version').notNull().default('v1.0'),
    dataConsentText: text('data_consent_text')
      .notNull()
      .default(
        'Autorizo de manera previa, expresa e informada el tratamiento de mis datos personales conforme a la Ley 1581 de 2012.',
      ),
    retentionDays: integer('retention_days').notNull().default(365),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_organizations_slug').on(table.slug)],
);

export const sitesTable = organizationsSchema.table(
  'sites',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    address: text('address'),
    loanPointCode: text('loan_point_code').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_organizations_sites_org_code').on(table.organizationId, table.code),
    uniqueIndex('uq_organizations_sites_loan_point_code').on(table.loanPointCode),
    index('idx_organizations_sites_org').on(table.organizationId),
  ],
);
