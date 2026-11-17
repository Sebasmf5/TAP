import type {
  AuthTokenResponse,
  ChangePasswordRequest,
  CreateUserRequest,
  OrganizationType,
  RegisterOrganizationRequest,
  ServiceModulePlan,
  StaffRole,
  UpdateUserRequest,
  UserProfile,
  UserStatus,
} from '@tap/contracts';
import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  requireOrganizationId,
  type AuditLog,
  type Clock,
  type IdGenerator,
  type TenantContext,
} from '../../../shared/index.ts';
import {
  requireRole,
  toUserProfileDto,
  validatePasswordStrength,
  type RefreshTokenRecord,
  type StaffUser,
} from '../domain/entities.ts';
import type {
  AccessRepository,
  GoogleOAuthClient,
  JwtTokenService,
  PasswordHasher,
} from '../domain/ports.ts';

const REFRESH_FAMILY_MAX_DAYS = 30;
const USER_STATUS_CACHE_TTL_MS = 60_000;

export interface UserActiveState {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly role: StaffRole;
  readonly status: UserStatus;
}

export class UserStatusCache {
  private readonly entries = new Map<string, { state: UserActiveState; expiresAtMs: number }>();
  private readonly clock: Clock;
  private readonly ttlMs: number;

  constructor(clock: Clock, ttlMs = USER_STATUS_CACHE_TTL_MS) {
    this.clock = clock;
    this.ttlMs = Math.min(ttlMs, USER_STATUS_CACHE_TTL_MS);
  }

  get(userId: string): UserActiveState | null {
    const entry = this.entries.get(userId);
    if (!entry) return null;
    if (this.clock.now().getTime() >= entry.expiresAtMs) {
      this.entries.delete(userId);
      return null;
    }
    return entry.state;
  }

  set(state: UserActiveState): void {
    this.entries.set(state.userId, {
      state,
      expiresAtMs: this.clock.now().getTime() + this.ttlMs,
    });
  }

  invalidate(userId: string): void {
    this.entries.delete(userId);
  }
}

export class LoginRateLimiter {
  private readonly attempts = new Map<
    string,
    { failures: number; blockedUntilMs: number; lastAttemptMs: number }
  >();
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  private buildKey(ip: string, email: string): string {
    return `${ip.trim()}|${email.trim().toLowerCase()}`;
  }

  assertAllowed(ip: string, email: string): void {
    const key = this.buildKey(ip, email);
    const entry = this.attempts.get(key);
    if (!entry) return;
    const nowMs = this.clock.now().getTime();
    if (nowMs < entry.blockedUntilMs) {
      throw new RateLimitError(
        'Demasiados intentos de inicio de sesión fallidos. Espera unos segundos e inténtalo de nuevo.',
      );
    }
  }

  recordFailure(ip: string, email: string): void {
    const key = this.buildKey(ip, email);
    const nowMs = this.clock.now().getTime();
    const prev = this.attempts.get(key);
    const failures = (prev?.failures ?? 0) + 1;
    // Espera creciente a partir del 5to intento: 2s, 4s, 8s, 16s... hasta 5 min.
    const delayMs = failures < 5 ? 0 : Math.min(300_000, 2_000 * 2 ** Math.min(8, failures - 5));
    this.attempts.set(key, {
      failures,
      blockedUntilMs: nowMs + delayMs,
      lastAttemptMs: nowMs,
    });
  }

  recordSuccess(ip: string, email: string): void {
    this.attempts.delete(this.buildKey(ip, email));
  }
}

export function hashOpaqueToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function hashIpAddress(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip.trim(), 'utf8').digest('hex').slice(0, 32);
}

export interface SessionIssueResult {
  readonly response: AuthTokenResponse;
  readonly refreshTokenOpaque: string;
  readonly refreshCookieMaxAgeSeconds: number;
}

export class AccessService {
  private readonly repository: AccessRepository;
  private readonly passwordHasher: PasswordHasher;
  private readonly jwtService: JwtTokenService;
  private readonly googleClient?: GoogleOAuthClient;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly auditLog: AuditLog;
  private readonly refreshTtlDays: number;
  private readonly statusCache: UserStatusCache;
  private readonly loginLimiter: LoginRateLimiter;
  private readonly isEmailAllowedForOrg?: (
    organizationId: string,
    email: string,
  ) => Promise<boolean>;
  private readonly registerOrganizationForSignup?: (input: {
    organizationName: string;
    organizationType: OrganizationType;
    servicePlan: ServiceModulePlan;
  }) => Promise<{ organizationId: string; siteId: string }>;

  constructor(params: {
    repository: AccessRepository;
    passwordHasher: PasswordHasher;
    jwtService: JwtTokenService;
    googleClient?: GoogleOAuthClient;
    idGenerator: IdGenerator;
    clock: Clock;
    auditLog: AuditLog;
    refreshTtlDays: number;
    isEmailAllowedForOrg?: (organizationId: string, email: string) => Promise<boolean>;
    registerOrganizationForSignup?: (input: {
      organizationName: string;
      organizationType: OrganizationType;
      servicePlan: ServiceModulePlan;
    }) => Promise<{ organizationId: string; siteId: string }>;
  }) {
    this.repository = params.repository;
    this.passwordHasher = params.passwordHasher;
    this.jwtService = params.jwtService;
    this.googleClient = params.googleClient;
    this.idGenerator = params.idGenerator;
    this.clock = params.clock;
    this.auditLog = params.auditLog;
    this.refreshTtlDays = Math.min(30, Math.max(1, params.refreshTtlDays));
    this.statusCache = new UserStatusCache(params.clock);
    this.loginLimiter = new LoginRateLimiter(params.clock);
    this.isEmailAllowedForOrg = params.isEmailAllowedForOrg;
    this.registerOrganizationForSignup = params.registerOrganizationForSignup;
  }

  async registerOrganizationAdmin(params: {
    input: RegisterOrganizationRequest;
    ip: string;
    userAgent?: string;
  }): Promise<SessionIssueResult> {
    if (!this.registerOrganizationForSignup) {
      throw new ForbiddenError('El registro público de entidades no está habilitado.');
    }

    const email = params.input.adminEmail.trim().toLowerCase();
    validatePasswordStrength(params.input.adminPassword, email);

    const existingUser = await this.repository.findUserByEmail(email);
    if (existingUser) {
      throw new ConflictError('Ya existe una cuenta registrada con ese correo electrónico.');
    }

    const { organizationId } = await this.registerOrganizationForSignup({
      organizationName: params.input.organizationName,
      organizationType: params.input.organizationType,
      servicePlan: params.input.servicePlan,
    });

    const now = this.clock.now();
    const user: StaffUser = {
      id: this.idGenerator.nextId(),
      organizationId,
      email,
      fullName: params.input.adminFullName.trim(),
      passwordHash: await this.passwordHasher.hash(params.input.adminPassword),
      role: 'org_admin',
      status: 'active',
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createUser(user);

    const session = await this.issueSession({
      user,
      ip: params.ip,
      userAgent: params.userAgent,
    });

    await this.auditLog.record({
      organizationId,
      actorUserId: user.id,
      action: 'auth.register_organization',
      targetType: 'user',
      targetId: user.id,
      ipHash: hashIpAddress(params.ip),
      metadata: { servicePlan: params.input.servicePlan },
    });

    return session;
  }

  async loginWithPassword(params: {
    email: string;
    password: string;
    ip: string;
    userAgent?: string;
  }): Promise<SessionIssueResult> {
    const email = params.email.trim().toLowerCase();
    this.loginLimiter.assertAllowed(params.ip, email);

    const user = await this.repository.findUserByEmail(email);
    if (!user) {
      this.loginLimiter.recordFailure(params.ip, email);
      throw new UnauthorizedError('Correo o contraseña incorrectos.');
    }

    const passwordValid = await this.passwordHasher.verify(user.passwordHash, params.password);
    if (!passwordValid || user.status !== 'active') {
      this.loginLimiter.recordFailure(params.ip, email);
      throw new UnauthorizedError('Correo o contraseña incorrectos.');
    }

    this.loginLimiter.recordSuccess(params.ip, email);
    const session = await this.issueSession({
      user,
      ip: params.ip,
      userAgent: params.userAgent,
    });

    await this.auditLog.record({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: user.id,
      ipHash: hashIpAddress(params.ip),
      metadata: { method: 'password', role: user.role },
    });

    return session;
  }

  private async issueSession(params: {
    user: StaffUser;
    ip?: string;
    userAgent?: string;
    existingFamilyId?: string;
    existingFamilyExpiresAt?: Date;
    rotateFromTokenId?: string;
  }): Promise<SessionIssueResult> {
    const now = this.clock.now();
    const access = await this.jwtService.signAccessToken({
      userId: params.user.id,
      organizationId: params.user.organizationId,
      role: params.user.role,
      jti: this.idGenerator.nextId(),
      now,
    });

    const refreshTokenOpaque = randomBytes(32).toString('base64url');
    const tokenHash = hashOpaqueToken(refreshTokenOpaque);
    const familyId = params.existingFamilyId ?? this.idGenerator.nextId();
    const familyExpiresAt =
      params.existingFamilyExpiresAt ??
      new Date(now.getTime() + REFRESH_FAMILY_MAX_DAYS * 86_400_000);
    const stepExpiresAt = new Date(now.getTime() + this.refreshTtlDays * 86_400_000);
    const expiresAt =
      stepExpiresAt.getTime() < familyExpiresAt.getTime() ? stepExpiresAt : familyExpiresAt;

    const record: RefreshTokenRecord = {
      id: this.idGenerator.nextId(),
      userId: params.user.id,
      tokenHash,
      familyId,
      expiresAt,
      familyExpiresAt,
      revokedAt: null,
      replacedBy: null,
      userAgent: params.userAgent ?? null,
      ipHash: hashIpAddress(params.ip),
      createdAt: now,
    };

    if (params.rotateFromTokenId) {
      await this.repository.rotateRefreshToken({
        oldTokenId: params.rotateFromTokenId,
        revokedAt: now,
        newRecord: record,
      });
    } else {
      await this.repository.createRefreshToken(record);
    }

    this.statusCache.set({
      userId: params.user.id,
      organizationId: params.user.organizationId,
      role: params.user.role,
      status: params.user.status,
    });

    const maxAgeSeconds = Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));

    return {
      response: {
        accessToken: access.token,
        expiresInSeconds: access.expiresInSeconds,
        user: toUserProfileDto(params.user),
      },
      refreshTokenOpaque,
      refreshCookieMaxAgeSeconds: maxAgeSeconds,
    };
  }

  /**
   * Refresca y rota el token opaco. Si detecta reutilización de un token ya rotado,
   * revoca inmediatamente toda la familia (AGENTS.md A7.1).
   */
  async refreshSession(params: {
    refreshTokenOpaque: string | undefined;
    ip?: string;
    userAgent?: string;
  }): Promise<SessionIssueResult> {
    if (!params.refreshTokenOpaque) {
      throw new UnauthorizedError('Sesión no encontrada o expirada.');
    }

    const now = this.clock.now();
    const tokenHash = hashOpaqueToken(params.refreshTokenOpaque);
    const stored = await this.repository.findRefreshTokenByHash(tokenHash);
    if (!stored) {
      throw new UnauthorizedError('Sesión inválida o expirada.');
    }

    // Detección de reutilización de un token de refresco ya rotado o revocado:
    // revoca toda la familia inmediatamente.
    if (stored.replacedBy !== null || stored.revokedAt !== null) {
      await this.repository.revokeRefreshTokenFamily(stored.familyId, now);
      await this.auditLog.record({
        organizationId: null,
        actorUserId: stored.userId,
        action: 'auth.refresh_token_reuse_detected',
        targetType: 'refresh_token_family',
        targetId: stored.familyId,
        ipHash: hashIpAddress(params.ip),
        metadata: { tokenId: stored.id },
      });
      throw new UnauthorizedError(
        'Se detectó el uso de un token de sesión anterior. Por seguridad se cerraron las sesiones activas.',
      );
    }

    if (
      now.getTime() >= stored.expiresAt.getTime() ||
      now.getTime() >= stored.familyExpiresAt.getTime()
    ) {
      await this.repository.revokeRefreshTokenFamily(stored.familyId, now);
      throw new UnauthorizedError('La sesión ha expirado. Inicia sesión de nuevo.');
    }

    const user = await this.repository.findUserById(stored.userId);
    if (!user || user.status !== 'active') {
      await this.repository.revokeRefreshTokenFamily(stored.familyId, now);
      throw new UnauthorizedError('La cuenta de usuario no está activa.');
    }

    return this.issueSession({
      user,
      ip: params.ip,
      userAgent: params.userAgent,
      existingFamilyId: stored.familyId,
      existingFamilyExpiresAt: stored.familyExpiresAt,
      rotateFromTokenId: stored.id,
    });
  }

  async logout(refreshTokenOpaque: string | undefined): Promise<void> {
    if (!refreshTokenOpaque) return;
    const tokenHash = hashOpaqueToken(refreshTokenOpaque);
    const stored = await this.repository.findRefreshTokenByHash(tokenHash);
    if (!stored) return;
    await this.repository.revokeRefreshTokenFamily(stored.familyId, this.clock.now());
  }

  async getUserStatus(userId: string): Promise<UserActiveState | null> {
    const cached = this.statusCache.get(userId);
    if (cached) return cached;
    const user = await this.repository.findUserById(userId);
    if (!user) return null;
    const state: UserActiveState = {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      status: user.status,
    };
    this.statusCache.set(state);
    return state;
  }

  /**
   * Verifica la firma y claims del JWT (EdDSA, iss, aud, exp) y comprueba el estado
   * vigente del usuario (con caché <= 60 s) para que deshabilitar una cuenta surta efecto casi de inmediato.
   */
  async verifyAccessToken(token: string): Promise<TenantContext> {
    const claims = await this.jwtService.verifyAccessToken(token, this.clock.now());
    const state = await this.getUserStatus(claims.sub);
    if (!state || state.status !== 'active') {
      throw new UnauthorizedError('La cuenta de usuario está deshabilitada o no existe.');
    }
    return {
      userId: state.userId,
      organizationId: state.organizationId,
      role: state.role,
    };
  }

  async getMe(ctx: TenantContext): Promise<UserProfile> {
    const user = await this.repository.findUserById(ctx.userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('Usuario no encontrado o inactivo.');
    }
    return toUserProfileDto(user);
  }

  async changePassword(ctx: TenantContext, input: ChangePasswordRequest): Promise<void> {
    const user = await this.repository.findUserById(ctx.userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('Usuario no encontrado.');
    }

    const currentValid = await this.passwordHasher.verify(user.passwordHash, input.currentPassword);
    if (!currentValid) {
      throw new UnauthorizedError('La contraseña actual no es correcta.');
    }

    validatePasswordStrength(input.newPassword, user.email);
    const newHash = await this.passwordHasher.hash(input.newPassword);
    const now = this.clock.now();

    await this.repository.updateUser({
      ...user,
      passwordHash: newHash,
      tokenVersion: user.tokenVersion + 1,
      updatedAt: now,
    });
    await this.repository.revokeAllUserRefreshTokens(user.id, now);
    this.statusCache.invalidate(user.id);

    await this.auditLog.record({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'user.password_changed',
      targetType: 'user',
      targetId: user.id,
    });
  }

  async listUsers(ctx: TenantContext): Promise<UserProfile[]> {
    requireRole(ctx, ['org_admin']);
    const organizationId = requireOrganizationId(ctx);
    const users = await this.repository.listUsersByOrganization(organizationId);
    return users.map(toUserProfileDto);
  }

  async createUser(ctx: TenantContext, input: CreateUserRequest): Promise<UserProfile> {
    requireRole(ctx, ['org_admin']);
    const organizationId = requireOrganizationId(ctx);

    const email = input.email.trim().toLowerCase();
    if (this.isEmailAllowedForOrg) {
      const allowed = await this.isEmailAllowedForOrg(organizationId, email);
      if (!allowed) {
        throw new ValidationError(
          'El dominio del correo no está en la lista de dominios permitidos por tu entidad.',
          [{ path: 'email', message: 'Dominio de correo no autorizado por la entidad.' }],
        );
      }
    }

    const existing = await this.repository.findUserByEmail(email);
    if (existing) {
      throw new ConflictError('Ya existe un usuario registrado con ese correo electrónico.');
    }

    validatePasswordStrength(input.password, email);
    const passwordHash = await this.passwordHasher.hash(input.password);
    const now = this.clock.now();

    const user: StaffUser = {
      id: this.idGenerator.nextId(),
      organizationId,
      email,
      fullName: input.fullName.trim(),
      passwordHash,
      role: input.role,
      status: 'active',
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createUser(user);
    await this.auditLog.record({
      organizationId,
      actorUserId: ctx.userId,
      action: 'user.created',
      targetType: 'user',
      targetId: user.id,
      metadata: { role: user.role },
    });

    return toUserProfileDto(user);
  }

  async updateUser(
    ctx: TenantContext,
    targetUserId: string,
    input: UpdateUserRequest,
  ): Promise<UserProfile> {
    requireRole(ctx, ['org_admin']);
    const organizationId = requireOrganizationId(ctx);

    const existing = await this.repository.findUserById(targetUserId);
    if (!existing || existing.organizationId !== organizationId) {
      throw new NotFoundError('El usuario solicitado no existe en tu entidad.');
    }

    const nextRole = input.role ?? existing.role;
    const nextStatus = input.status ?? existing.status;
    if (existing.id === ctx.userId && nextStatus === 'disabled') {
      throw new ForbiddenError('No puedes deshabilitar tu propia cuenta.');
    }

    const now = this.clock.now();
    const updated: StaffUser = {
      ...existing,
      fullName: input.fullName ? input.fullName.trim() : existing.fullName,
      role: nextRole,
      status: nextStatus,
      tokenVersion:
        nextRole !== existing.role || nextStatus !== existing.status
          ? existing.tokenVersion + 1
          : existing.tokenVersion,
      updatedAt: now,
    };

    await this.repository.updateUser(updated);
    this.statusCache.invalidate(updated.id);

    if (nextStatus === 'disabled') {
      await this.repository.revokeAllUserRefreshTokens(updated.id, now);
    }

    if (nextRole !== existing.role) {
      await this.auditLog.record({
        organizationId,
        actorUserId: ctx.userId,
        action: 'user.role_changed',
        targetType: 'user',
        targetId: updated.id,
        metadata: { previousRole: existing.role, newRole: nextRole },
      });
    }

    return toUserProfileDto(updated);
  }

  async disableUser(ctx: TenantContext, targetUserId: string): Promise<UserProfile> {
    const profile = await this.updateUser(ctx, targetUserId, { status: 'disabled' });
    await this.auditLog.record({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'user.disabled',
      targetType: 'user',
      targetId: targetUserId,
    });
    return profile;
  }

  buildGoogleAuthorizationUrl(): { authorizationUrl: string; state: string } {
    if (!this.googleClient || !this.googleClient.isConfigured()) {
      throw new ValidationError(
        'El inicio de sesión con Google no está configurado en este entorno.',
      );
    }
    const state = randomBytes(18).toString('base64url');
    return {
      authorizationUrl: this.googleClient.buildAuthorizationUrl(state),
      state,
    };
  }

  async completeGoogleCallback(params: {
    code: string;
    ip: string;
    userAgent?: string;
  }): Promise<SessionIssueResult> {
    if (!this.googleClient || !this.googleClient.isConfigured()) {
      throw new ValidationError('El inicio de sesión con Google no está configurado.');
    }
    const googleUser = await this.googleClient.exchangeCodeForUser(params.code);
    if (!googleUser.emailVerified) {
      throw new UnauthorizedError('Tu cuenta de Google no tiene un correo verificado.');
    }

    const email = googleUser.email.trim().toLowerCase();
    const user = await this.repository.findUserByEmail(email);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError(
        'No existe una cuenta de funcionario autorizada para ese correo.',
      );
    }

    if (user.organizationId && this.isEmailAllowedForOrg) {
      const allowed = await this.isEmailAllowedForOrg(user.organizationId, email);
      if (!allowed) {
        throw new ForbiddenError('El dominio de tu correo no está autorizado por la entidad.');
      }
    }

    const existingOAuth = await this.repository.findOAuthAccount('google', googleUser.sub);
    if (!existingOAuth) {
      await this.repository.createOAuthAccount({
        id: this.idGenerator.nextId(),
        userId: user.id,
        provider: 'google',
        providerAccountId: googleUser.sub,
        email,
        createdAt: this.clock.now(),
      });
    }

    const session = await this.issueSession({
      user,
      ip: params.ip,
      userAgent: params.userAgent,
    });

    await this.auditLog.record({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: user.id,
      ipHash: hashIpAddress(params.ip),
      metadata: { method: 'google', role: user.role },
    });

    return session;
  }

  /**
   * Crea un usuario inicial (para semillas o pruebas) validando fortaleza de contraseña.
   */
  async seedStaffUser(params: {
    id?: string;
    organizationId: string | null;
    email: string;
    fullName: string;
    password: string;
    role: StaffRole;
  }): Promise<StaffUser> {
    const email = params.email.trim().toLowerCase();
    const existing = await this.repository.findUserByEmail(email);
    if (existing) return existing;

    validatePasswordStrength(params.password, email);
    const passwordHash = await this.passwordHasher.hash(params.password);
    const now = this.clock.now();
    const user: StaffUser = {
      id: params.id ?? this.idGenerator.nextId(),
      organizationId: params.organizationId,
      email,
      fullName: params.fullName,
      passwordHash,
      role: params.role,
      status: 'active',
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.createUser(user);
    return user;
  }
}
