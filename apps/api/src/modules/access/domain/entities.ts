import type { StaffRole, UserProfile, UserStatus } from '@tap/contracts';
import { ForbiddenError, ValidationError, type TenantContext } from '../../../shared/index.ts';

export interface StaffUser {
  readonly id: string;
  readonly organizationId: string | null;
  readonly email: string;
  readonly fullName: string;
  readonly passwordHash: string;
  readonly role: StaffRole;
  readonly status: UserStatus;
  readonly tokenVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly expiresAt: Date;
  readonly familyExpiresAt: Date;
  readonly revokedAt: Date | null;
  readonly replacedBy: string | null;
  readonly userAgent: string | null;
  readonly ipHash: string | null;
  readonly createdAt: Date;
}

export interface OAuthAccount {
  readonly id: string;
  readonly userId: string;
  readonly provider: 'google';
  readonly providerAccountId: string;
  readonly email: string;
  readonly createdAt: Date;
}

/**
 * Claims del token de acceso JWT (AGENTS.md A7.1).
 * Nunca incluye datos personales (ni correo ni nombre).
 */
export interface AccessTokenClaims {
  readonly iss: string;
  readonly aud: string;
  readonly sub: string;
  readonly org: string | null;
  readonly role: StaffRole;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

/** Lista de contraseñas comunes o predecibles prohibidas por AGENTS.md A7.1. */
const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890123',
  'password1234',
  'password12345',
  'contraseña123',
  'contrasena123',
  'administrador',
  'administrador1',
  'administrador123',
  'qwertyuiop12',
  'qwerty123456',
  'bienestar123',
  'bienestar2026',
  'universidad12',
  'uceva1234567',
  'tap123456789',
]);

export function validatePasswordStrength(password: string, email?: string): void {
  if (password.length < 12) {
    throw new ValidationError('La contraseña debe tener al menos 12 caracteres.', [
      { path: 'password', message: 'Usa al menos 12 caracteres.' },
    ]);
  }
  const normalized = password.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(normalized) || /^(.)\1{11,}$/.test(normalized)) {
    throw new ValidationError(
      'Esta contraseña es demasiado común. Elige una frase o combinación menos predecible.',
      [{ path: 'password', message: 'Contraseña común no permitida.' }],
    );
  }
  if (email) {
    const localPart = email.split('@')[0]?.toLowerCase();
    if (localPart && localPart.length >= 4 && normalized.includes(localPart)) {
      throw new ValidationError('La contraseña no debe contener tu usuario de correo.', [
        { path: 'password', message: 'No incluyas tu correo en la contraseña.' },
      ]);
    }
  }
}

export function hasAnyRole(ctx: TenantContext, allowedRoles: ReadonlyArray<StaffRole>): boolean {
  return allowedRoles.includes(ctx.role);
}

export function requireRole(ctx: TenantContext, allowedRoles: ReadonlyArray<StaffRole>): void {
  if (!hasAnyRole(ctx, allowedRoles)) {
    throw new ForbiddenError('No tienes el rol necesario para realizar esta acción.');
  }
}

export function toUserProfileDto(user: StaffUser): UserProfile {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}
