import { sql } from 'drizzle-orm';
import { index, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const attendanceSchema = pgSchema('attendance');

export const attendanceRecordsTable = attendanceSchema.table(
  'attendance_records',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    personId: uuid('person_id').notNull(),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true, mode: 'date' }).notNull(),
    method: text('method').notNull(),
    registeredBy: uuid('registered_by'),
    status: text('status').notNull().default('valid'),
    voidReason: text('void_reason'),
    voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),
    voidedBy: uuid('voided_by'),
    clientDurationMs: integer('client_duration_ms'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
  },
  (table) => [
    index('idx_attendance_org_event_time').on(
      table.organizationId,
      table.eventId,
      table.checkedInAt,
    ),
    uniqueIndex('uq_attendance_event_session_person_valid')
      .on(table.eventId, table.sessionId, table.personId)
      .where(sql`${table.status} = 'valid'`),
  ],
);

export const eventPreregistrationsTable = attendanceSchema.table(
  'event_preregistrations',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    personId: uuid('person_id').notNull(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_preregistration_event_person').on(table.eventId, table.personId),
    index('idx_preregistration_org_event').on(table.organizationId, table.eventId),
  ],
);
