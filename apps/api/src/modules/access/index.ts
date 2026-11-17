import type { OrganizationType, ServiceModulePlan, StaffRole } from '@tap/contracts';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type {
  AppConfig,
  AuditLog,
  Clock,
  DrizzleExecutor,
  IdGenerator,
  TenantContext,
} from '../../shared/index.ts';
import {
  AccessService,
  LoginRateLimiter,
  UserStatusCache,
  type UserActiveState,
} from './application/use-cases.ts';
import {
  hasAnyRole,
  requireRole,
  toUserProfileDto,
  validatePasswordStrength,
  type AccessTokenClaims,
  type OAuthAccount,
  type RefreshTokenRecord,
  type StaffUser,
} from './domain/entities.ts';
import type {
  AccessRepository,
  GoogleOAuthClient,
  JwtTokenService,
  PasswordHasher,
} from './domain/ports.ts';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  createAccessRoutes,
  createAuthenticateRequest,
  extractBearerToken,
} from './http/routes.ts';
import {
  Argon2PasswordHasher,
  HttpGoogleOAuthClient,
  JoseJwtTokenService,
  generateEd25519KeyPairBase64,
  parseTtlToSeconds,
} from './infrastructure/crypto.ts';
import { DrizzleAccessRepository, InMemoryAccessRepository } from './infrastructure/repository.ts';
import {
  accessSchema,
  oauthAccountsTable,
  refreshTokensTable,
  usersTable,
} from './infrastructure/schema.ts';

export interface AccessModule {
  readonly service: AccessService;
  readonly repository: AccessRepository;
  readonly passwordHasher: PasswordHasher;
  readonly jwtService: JwtTokenService;
  verifyAccessToken(token: string): Promise<TenantContext>;
  getUserStatus(userId: string): Promise<UserActiveState | null>;
  requireRole(ctx: TenantContext, allowedRoles: readonly StaffRole[]): void;
  authenticateRequest(req: FastifyRequest): Promise<TenantContext>;
  createRoutes(): FastifyPluginAsync;
}

export function createAccessModule(params: {
  config: AppConfig;
  db?: DrizzleExecutor;
  repository?: AccessRepository;
  passwordHasher?: PasswordHasher;
  jwtService?: JwtTokenService;
  googleClient?: GoogleOAuthClient;
  idGenerator: IdGenerator;
  clock: Clock;
  auditLog: AuditLog;
  isEmailAllowedForOrg?: (organizationId: string, email: string) => Promise<boolean>;
  registerOrganizationForSignup?: (input: {
    organizationName: string;
    organizationType: OrganizationType;
    servicePlan: ServiceModulePlan;
  }) => Promise<{ organizationId: string; siteId: string }>;
}): AccessModule {
  const repository =
    params.repository ??
    (params.db ? new DrizzleAccessRepository(params.db) : new InMemoryAccessRepository());

  const passwordHasher = params.passwordHasher ?? new Argon2PasswordHasher();

  const jwtService =
    params.jwtService ??
    new JoseJwtTokenService({
      privateKeyBase64: params.config.JWT_PRIVATE_KEY,
      publicKeyBase64: params.config.JWT_PUBLIC_KEY,
      issuer: params.config.JWT_ISSUER,
      audience: params.config.JWT_AUDIENCE,
      accessTtl: params.config.JWT_ACCESS_TTL,
    });

  const googleClient =
    params.googleClient ??
    new HttpGoogleOAuthClient({
      clientId: params.config.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: params.config.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri: params.config.GOOGLE_OAUTH_REDIRECT_URI,
    });

  const service = new AccessService({
    repository,
    passwordHasher,
    jwtService,
    googleClient,
    idGenerator: params.idGenerator,
    clock: params.clock,
    auditLog: params.auditLog,
    refreshTtlDays: params.config.JWT_REFRESH_TTL_DAYS,
    isEmailAllowedForOrg: params.isEmailAllowedForOrg,
    registerOrganizationForSignup: params.registerOrganizationForSignup,
  });

  const authenticateRequest = createAuthenticateRequest(service);

  return {
    service,
    repository,
    passwordHasher,
    jwtService,
    verifyAccessToken(token: string) {
      return service.verifyAccessToken(token);
    },
    getUserStatus(userId: string) {
      return service.getUserStatus(userId);
    },
    requireRole(ctx: TenantContext, allowedRoles: readonly StaffRole[]) {
      requireRole(ctx, allowedRoles);
    },
    authenticateRequest,
    createRoutes() {
      return createAccessRoutes({
        service,
        cookieSecure: params.config.COOKIE_SECURE,
        appUrl: params.config.APP_URL,
      });
    },
  };
}

export {
  AccessService,
  Argon2PasswordHasher,
  DrizzleAccessRepository,
  HttpGoogleOAuthClient,
  InMemoryAccessRepository,
  JoseJwtTokenService,
  LoginRateLimiter,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  UserStatusCache,
  accessSchema,
  createAccessRoutes,
  createAuthenticateRequest,
  extractBearerToken,
  generateEd25519KeyPairBase64,
  hasAnyRole,
  oauthAccountsTable,
  parseTtlToSeconds,
  refreshTokensTable,
  requireRole,
  toUserProfileDto,
  usersTable,
  validatePasswordStrength,
  type AccessRepository,
  type AccessTokenClaims,
  type GoogleOAuthClient,
  type JwtTokenService,
  type OAuthAccount,
  type PasswordHasher,
  type RefreshTokenRecord,
  type StaffUser,
  type UserActiveState,
};
