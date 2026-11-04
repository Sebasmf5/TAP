import { index, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const accessSchema = pgSchema('access');

export const usersTable = accessSchema.table(
  'users',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id'),
    email: text('email').notNull(),
    fullName: text('full_name').notNull().default('Funcionario'),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull().default('active'),
    tokenVersion: integer('token_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_access_users_email').on(table.email),
    index('idx_access_users_org_id').on(table.organizationId),
  ],
);

export const refreshTokensTable = accessSchema.table(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    familyId: uuid('family_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    familyExpiresAt: timestamp('family_expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    replacedBy: uuid('replaced_by'),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_access_refresh_tokens_hash').on(table.tokenHash),
    index('idx_access_refresh_tokens_family').on(table.familyId),
    index('idx_access_refresh_tokens_user').on(table.userId),
  ],
);

export const oauthAccountsTable = accessSchema.table(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_access_oauth_provider_account').on(table.provider, table.providerAccountId),
    index('idx_access_oauth_user').on(table.userId),
  ],
);
