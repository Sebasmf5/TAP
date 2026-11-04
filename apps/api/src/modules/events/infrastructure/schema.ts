import {
  boolean,
  index,
  integer,
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
    capacity: integer('capacity'),
    confirmIdentity: boolean('confirm_identity').notNull().default(true),
    allowWalkIn: boolean('allow_walk_in').notNull().default(false),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_events_public_code').on(table.publicCode),
    index('idx_events_org_status').on(table.organizationId, table.status),
  ],
);
