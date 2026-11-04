import type { StaffRole, UserStatus } from '@tap/contracts';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DrizzleExecutor } from '../../../shared/index.ts';
import type { OAuthAccount, RefreshTokenRecord, StaffUser } from '../domain/entities.ts';
import type { AccessRepository } from '../domain/ports.ts';
import { oauthAccountsTable, refreshTokensTable, usersTable } from './schema.ts';

function mapUserRow(row: typeof usersTable.$inferSelect): StaffUser {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    fullName: row.fullName,
    passwordHash: row.passwordHash,
    role: row.role as StaffRole,
    status: row.status as UserStatus,
    tokenVersion: row.tokenVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRefreshTokenRow(row: typeof refreshTokensTable.$inferSelect): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    familyId: row.familyId,
    expiresAt: row.expiresAt,
    familyExpiresAt: row.familyExpiresAt,
    revokedAt: row.revokedAt,
    replacedBy: row.replacedBy,
    userAgent: row.userAgent,
    ipHash: row.ipHash,
    createdAt: row.createdAt,
  };
}

export class DrizzleAccessRepository implements AccessRepository {
  private readonly db: DrizzleExecutor;

  constructor(db: DrizzleExecutor) {
    this.db = db;
  }

  async findUserById(id: string): Promise<StaffUser | null> {
    const rows = await this.db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async findUserByEmail(email: string, organizationId?: string | null): Promise<StaffUser | null> {
    const normalized = email.trim().toLowerCase();
    const condition =
      organizationId === undefined
        ? eq(usersTable.email, normalized)
        : organizationId === null
          ? and(eq(usersTable.email, normalized), isNull(usersTable.organizationId))
          : and(eq(usersTable.email, normalized), eq(usersTable.organizationId, organizationId));

    const rows = await this.db.select().from(usersTable).where(condition).limit(1);
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async listUsersByOrganization(organizationId: string): Promise<StaffUser[]> {
    const rows = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.organizationId, organizationId))
      .orderBy(asc(usersTable.fullName));
    return rows.map(mapUserRow);
  }

  async createUser(user: StaffUser): Promise<void> {
    await this.db.insert(usersTable).values({
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      fullName: user.fullName,
      passwordHash: user.passwordHash,
      role: user.role,
      status: user.status,
      tokenVersion: user.tokenVersion,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async updateUser(user: StaffUser): Promise<void> {
    await this.db
      .update(usersTable)
      .set({
        fullName: user.fullName,
        passwordHash: user.passwordHash,
        role: user.role,
        status: user.status,
        tokenVersion: user.tokenVersion,
        updatedAt: user.updatedAt,
      })
      .where(eq(usersTable.id, user.id));
  }

  async createRefreshToken(record: RefreshTokenRecord): Promise<void> {
    await this.db.insert(refreshTokensTable).values({
      id: record.id,
      userId: record.userId,
      tokenHash: record.tokenHash,
      familyId: record.familyId,
      expiresAt: record.expiresAt,
      familyExpiresAt: record.familyExpiresAt,
      revokedAt: record.revokedAt,
      replacedBy: record.replacedBy,
      userAgent: record.userAgent,
      ipHash: record.ipHash,
      createdAt: record.createdAt,
    });
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const rows = await this.db
      .select()
      .from(refreshTokensTable)
      .where(eq(refreshTokensTable.tokenHash, tokenHash))
      .limit(1);
    return rows[0] ? mapRefreshTokenRow(rows[0]) : null;
  }

  async rotateRefreshToken(params: {
    oldTokenId: string;
    revokedAt: Date;
    newRecord: RefreshTokenRecord;
  }): Promise<void> {
    await this.db
      .update(refreshTokensTable)
      .set({
        revokedAt: params.revokedAt,
        replacedBy: params.newRecord.id,
      })
      .where(eq(refreshTokensTable.id, params.oldTokenId));

    await this.createRefreshToken(params.newRecord);
  }

  async revokeRefreshTokenFamily(familyId: string, revokedAt: Date): Promise<void> {
    await this.db
      .update(refreshTokensTable)
      .set({ revokedAt })
      .where(and(eq(refreshTokensTable.familyId, familyId), isNull(refreshTokensTable.revokedAt)));
  }

  async revokeAllUserRefreshTokens(userId: string, revokedAt: Date): Promise<void> {
    await this.db
      .update(refreshTokensTable)
      .set({ revokedAt })
      .where(and(eq(refreshTokensTable.userId, userId), isNull(refreshTokensTable.revokedAt)));
  }

  async findOAuthAccount(
    provider: 'google',
    providerAccountId: string,
  ): Promise<OAuthAccount | null> {
    const rows = await this.db
      .select()
      .from(oauthAccountsTable)
      .where(
        and(
          eq(oauthAccountsTable.provider, provider),
          eq(oauthAccountsTable.providerAccountId, providerAccountId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      provider: row.provider as 'google',
      providerAccountId: row.providerAccountId,
      email: row.email,
      createdAt: row.createdAt,
    };
  }

  async createOAuthAccount(account: OAuthAccount): Promise<void> {
    await this.db.insert(oauthAccountsTable).values({
      id: account.id,
      userId: account.userId,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      email: account.email,
      createdAt: account.createdAt,
    });
  }
}

export class InMemoryAccessRepository implements AccessRepository {
  private readonly users = new Map<string, StaffUser>();
  private readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  private readonly oauthAccounts = new Map<string, OAuthAccount>();

  async findUserById(id: string): Promise<StaffUser | null> {
    return this.users.get(id) ?? null;
  }

  async findUserByEmail(email: string, organizationId?: string | null): Promise<StaffUser | null> {
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email !== normalized) continue;
      if (organizationId !== undefined && user.organizationId !== organizationId) continue;
      return user;
    }
    return null;
  }

  async listUsersByOrganization(organizationId: string): Promise<StaffUser[]> {
    return [...this.users.values()]
      .filter((u) => u.organizationId === organizationId)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async createUser(user: StaffUser): Promise<void> {
    this.users.set(user.id, user);
  }

  async updateUser(user: StaffUser): Promise<void> {
    this.users.set(user.id, user);
  }

  async createRefreshToken(record: RefreshTokenRecord): Promise<void> {
    this.refreshTokens.set(record.id, record);
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    for (const token of this.refreshTokens.values()) {
      if (token.tokenHash === tokenHash) return token;
    }
    return null;
  }

  async rotateRefreshToken(params: {
    oldTokenId: string;
    revokedAt: Date;
    newRecord: RefreshTokenRecord;
  }): Promise<void> {
    const existing = this.refreshTokens.get(params.oldTokenId);
    if (existing) {
      this.refreshTokens.set(existing.id, {
        ...existing,
        revokedAt: params.revokedAt,
        replacedBy: params.newRecord.id,
      });
    }
    this.refreshTokens.set(params.newRecord.id, params.newRecord);
  }

  async revokeRefreshTokenFamily(familyId: string, revokedAt: Date): Promise<void> {
    for (const [id, token] of this.refreshTokens.entries()) {
      if (token.familyId === familyId && token.revokedAt === null) {
        this.refreshTokens.set(id, { ...token, revokedAt });
      }
    }
  }

  async revokeAllUserRefreshTokens(userId: string, revokedAt: Date): Promise<void> {
    for (const [id, token] of this.refreshTokens.entries()) {
      if (token.userId === userId && token.revokedAt === null) {
        this.refreshTokens.set(id, { ...token, revokedAt });
      }
    }
  }

  async findOAuthAccount(
    provider: 'google',
    providerAccountId: string,
  ): Promise<OAuthAccount | null> {
    return this.oauthAccounts.get(`${provider}:${providerAccountId}`) ?? null;
  }

  async createOAuthAccount(account: OAuthAccount): Promise<void> {
    this.oauthAccounts.set(`${account.provider}:${account.providerAccountId}`, account);
  }
}
