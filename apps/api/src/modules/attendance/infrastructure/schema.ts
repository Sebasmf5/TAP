import { index, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const attendanceSchema = pgSchema('attendance');

export const attendanceRecordsTable = attendanceSchema.table(
  'attendance_records',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    sessionId: uuid('session_id'),
    personId: uuid('person_id').notNull(),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true, mode: 'date' }).notNull(),
    method: text('method').notNull(),
    registeredBy: uuid('registered_by'),
    status: text('status').notNull().default('valid'),
    voidReason: text('void_reason'),
    clientDurationMs: integer('client_duration_ms'),
  },
  (table) => [
    index('idx_attendance_org_event_time').on(
      table.organizationId,
      table.eventId,
      table.checkedInAt,
    ),
  ],
);
