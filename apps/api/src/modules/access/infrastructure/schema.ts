import { integer, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const accessSchema = pgSchema('access');

export const usersTable = accessSchema.table(
  'users',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id'),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull().default('active'),
    tokenVersion: integer('token_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_access_users_org_email').on(table.organizationId, table.email)],
);
