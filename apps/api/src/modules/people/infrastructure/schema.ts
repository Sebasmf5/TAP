import { boolean, index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const peopleSchema = pgSchema('people');

export const peopleTable = peopleSchema.table(
  'people',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    documentType: text('document_type').notNull(),
    documentNumber: text('document_number').notNull(),
    institutionalCode: text('institutional_code'),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    personType: text('person_type').notNull().default('student'),
    isMinor: boolean('is_minor').notNull().default(false),
    qrToken: text('qr_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_people_org_doc').on(
      table.organizationId,
      table.documentType,
      table.documentNumber,
    ),
    index('idx_people_org_code').on(table.organizationId, table.institutionalCode),
    uniqueIndex('uq_people_qr_token').on(table.qrToken),
  ],
);
