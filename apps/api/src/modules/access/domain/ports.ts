import type { StaffRole } from '@tap/contracts';
import type { AccessTokenClaims, OAuthAccount, RefreshTokenRecord, StaffUser } from './entities.ts';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface SignAccessTokenInput {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly role: StaffRole;
  readonly jti: string;
  readonly now: Date;
}

export interface JwtTokenService {
  signAccessToken(
    input: SignAccessTokenInput,
  ): Promise<{ token: string; expiresInSeconds: number }>;
  verifyAccessToken(token: string, now?: Date): Promise<AccessTokenClaims>;
}

export interface GoogleOAuthUserInfo {
  readonly sub: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
}

export interface GoogleOAuthClient {
  isConfigured(): boolean;
  buildAuthorizationUrl(state: string): string;
  exchangeCodeForUser(code: string): Promise<GoogleOAuthUserInfo>;
}

export interface AccessRepository {
  findUserById(id: string): Promise<StaffUser | null>;
  findUserByEmail(email: string, organizationId?: string | null): Promise<StaffUser | null>;
  listUsersByOrganization(organizationId: string): Promise<StaffUser[]>;
  createUser(user: StaffUser): Promise<void>;
  updateUser(user: StaffUser): Promise<void>;

  createRefreshToken(record: RefreshTokenRecord): Promise<void>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  rotateRefreshToken(params: {
    oldTokenId: string;
    revokedAt: Date;
    newRecord: RefreshTokenRecord;
  }): Promise<void>;
  revokeRefreshTokenFamily(familyId: string, revokedAt: Date): Promise<void>;
  revokeAllUserRefreshTokens(userId: string, revokedAt: Date): Promise<void>;

  findOAuthAccount(provider: 'google', providerAccountId: string): Promise<OAuthAccount | null>;
  createOAuthAccount(account: OAuthAccount): Promise<void>;
}
