import type { CertificateRule, IdentificationMode } from '@tap/contracts';
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

export const eventsSchema = pgSchema('events');

export const eventsTable = eventsSchema.table(
  'events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    siteId: uuid('site_id'),
    name: text('name').notNull(),
    description: text('description'),
    type: text('type').notNull(),
    status: text('status').notNull().default('draft'),
    publicCode: text('public_code').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
    checkinOpensAt: timestamp('checkin_opens_at', { withTimezone: true, mode: 'date' }).notNull(),
    checkinClosesAt: timestamp('checkin_closes_at', { withTimezone: true, mode: 'date' }).notNull(),
    capacity: integer('capacity'),
    allowedIdentificationModes: jsonb('allowed_identification_modes')
      .$type<IdentificationMode[]>()
      .notNull(),
    confirmIdentity: boolean('confirm_identity').notNull().default(true),
    allowWalkIn: boolean('allow_walk_in').notNull().default(false),
    certificateRule: jsonb('certificate_rule').$type<CertificateRule>().notNull(),
    autoIssueCertificates: boolean('auto_issue_certificates').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_events_public_code').on(table.publicCode),
    index('idx_events_org_status').on(table.organizationId, table.status),
  ],
);

export const eventSessionsTable = eventsSchema.table(
  'event_sessions',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => eventsTable.id, { onDelete: 'cascade' }),
    sessionNumber: integer('session_number').notNull(),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_sessions_event').on(table.organizationId, table.eventId, table.sessionNumber),
  ],
);
