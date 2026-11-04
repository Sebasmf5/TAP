import type {
  FeatureFlags,
  FeatureKey,
  OrganizationDto,
  OrganizationPlan,
  OrganizationType,
  SiteDto,
} from '@tap/contracts';

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  attendance: true,
  certificates: true,
  inventory: true,
  loans: true,
  reports: true,
  kioskMode: true,
  googleSso: false,
};

export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly type: OrganizationType;
  readonly plan: OrganizationPlan;
  readonly features: FeatureFlags;
  readonly logoUrl: string | null;
  readonly timezone: string;
  readonly allowedEmailDomains: ReadonlyArray<string>;
  readonly dataConsentVersion: string;
  readonly dataConsentText: string;
  readonly retentionDays: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Site {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly code: string;
  readonly address: string | null;
  readonly loanPointCode: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function mergeFeatureFlags(
  base: FeatureFlags = DEFAULT_FEATURE_FLAGS,
  overrides?: Partial<FeatureFlags>,
): FeatureFlags {
  return {
    attendance: overrides?.attendance ?? base.attendance,
    certificates: overrides?.certificates ?? base.certificates,
    inventory: overrides?.inventory ?? base.inventory,
    loans: overrides?.loans ?? base.loans,
    reports: overrides?.reports ?? base.reports,
    kioskMode: overrides?.kioskMode ?? base.kioskMode,
    googleSso: overrides?.googleSso ?? base.googleSso,
  };
}

export function isFeatureEnabled(org: Organization, key: FeatureKey): boolean {
  return Boolean(org.features[key]);
}

/**
 * Comprueba si un correo cumple los dominios permitidos de la entidad (AGENTS.md A7.1).
 * Si la entidad no restringió dominios (lista vacía), permite cualquier dominio válido.
 */
export function isEmailDomainAllowed(org: Organization, email: string): boolean {
  if (org.allowedEmailDomains.length === 0) return true;
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return false;
  return org.allowedEmailDomains.some((allowed) => allowed.toLowerCase() === domain);
}

export function toOrganizationDto(org: Organization): OrganizationDto {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    type: org.type,
    plan: org.plan,
    features: { ...org.features },
    logoUrl: org.logoUrl,
    timezone: org.timezone,
    allowedEmailDomains: [...org.allowedEmailDomains],
    dataConsentVersion: org.dataConsentVersion,
    dataConsentText: org.dataConsentText,
    retentionDays: org.retentionDays,
    createdAt: org.createdAt.toISOString(),
  };
}

export function toSiteDto(site: Site): SiteDto {
  return {
    id: site.id,
    organizationId: site.organizationId,
    name: site.name,
    code: site.code,
    address: site.address,
    loanPointCode: site.loanPointCode,
    isActive: site.isActive,
    createdAt: site.createdAt.toISOString(),
  };
}
