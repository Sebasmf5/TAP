import type { StaffRole } from '@tap/contracts';
import { ForbiddenError } from './errors.ts';

export interface TenantContext {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly role: StaffRole;
}

/**
 * Garantiza que el contexto pertenece a una entidad y coincide con el registro objetivo (A5.7).
 */
export function requireOrganizationId(ctx: TenantContext): string {
  if (!ctx.organizationId) {
    throw new ForbiddenError('Esta operación requiere el contexto de una entidad.');
  }
  return ctx.organizationId;
}

export function assertSameOrganization(ctx: TenantContext, targetOrganizationId: string): void {
  if (ctx.organizationId !== targetOrganizationId) {
    throw new ForbiddenError('No tienes acceso a datos de otra entidad.');
  }
}
