import { index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const certificatesSchema = pgSchema('certificates');

export const certificatesTable = certificatesSchema.table(
  'certificates',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    personId: uuid('person_id').notNull(),
    code: text('code').notNull(),
    status: text('status').notNull().default('issued'),
    pdfPath: text('pdf_path'),
    pdfSha256: text('pdf_sha256'),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    revokedReason: text('revoked_reason'),
  },
  (table) => [
    uniqueIndex('uq_certificates_code').on(table.code),
    index('idx_certificates_org_event').on(table.organizationId, table.eventId),
  ],
);
