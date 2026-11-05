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

export const certificatesSchema = pgSchema('certificates');

export interface CertificateTemplateSignerRecord {
  name: string;
  role: string;
}

export interface CertificateTemplateSnapshotRecord {
  title: string;
  bodyText: string;
  holderName: string;
  maskedDocument: string;
  recipientEmail: string | null;
  eventName: string;
  eventDate: string;
  hours: string;
  organizationName: string;
  signers: CertificateTemplateSignerRecord[];
  orientation: 'landscape' | 'portrait';
  version: number;
}

export const certificateTemplatesTable = certificatesSchema.table(
  'certificate_templates',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    title: text('title').notNull(),
    bodyTemplate: text('body_template').notNull(),
    logoUrl: text('logo_url'),
    signers: jsonb('signers').$type<CertificateTemplateSignerRecord[]>().notNull().default([]),
    orientation: text('orientation').notNull().default('landscape'),
    version: integer('version').notNull().default(1),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('idx_certificate_templates_org').on(table.organizationId)],
);

export const certificatesTable = certificatesSchema.table(
  'certificates',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    personId: uuid('person_id').notNull(),
    templateId: uuid('template_id'),
    code: text('code').notNull(),
    status: text('status').notNull().default('issued'),
    templateSnapshot: jsonb('template_snapshot')
      .$type<CertificateTemplateSnapshotRecord>()
      .notNull(),
    pdfPath: text('pdf_path'),
    pdfSha256: text('pdf_sha256'),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedByUserId: uuid('revoked_by_user_id'),
    revokedReason: text('revoked_reason'),
    verificationCount: integer('verification_count').notNull().default(0),
  },
  (table) => [
    uniqueIndex('uq_certificates_code').on(table.code),
    index('idx_certificates_org_event').on(table.organizationId, table.eventId),
    index('idx_certificates_event_person').on(table.eventId, table.personId),
  ],
);
