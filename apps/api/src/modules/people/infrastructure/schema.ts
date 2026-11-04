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
    guardianName: text('guardian_name'),
    guardianDocument: text('guardian_document'),
    guardianPhone: text('guardian_phone'),
    qrToken: text('qr_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
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

export const consentsTable = peopleSchema.table(
  'consents',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    personId: uuid('person_id')
      .notNull()
      .references(() => peopleTable.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    channel: text('channel').notNull(),
    ipHash: text('ip_hash'),
  },
  (table) => [index('idx_people_consents_person').on(table.organizationId, table.personId)],
);
