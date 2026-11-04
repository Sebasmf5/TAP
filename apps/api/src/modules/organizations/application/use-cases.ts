import type {
  CreateOrganizationRequest,
  CreateSiteRequest,
  FeatureKey,
  OrganizationDto,
  SiteDto,
  UpdateOrganizationRequest,
  UpdateSiteRequest,
} from '@tap/contracts';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  requireOrganizationId,
  type AuditLog,
  type Clock,
  type IdGenerator,
  type TenantContext,
} from '../../../shared/index.ts';
import {
  DEFAULT_FEATURE_FLAGS,
  isEmailDomainAllowed,
  isFeatureEnabled,
  mergeFeatureFlags,
  toOrganizationDto,
  toSiteDto,
  type Organization,
  type Site,
} from '../domain/entities.ts';
import type { OrganizationsRepository } from '../domain/ports.ts';

export class FeatureGate {
  private readonly repository: OrganizationsRepository;

  constructor(repository: OrganizationsRepository) {
    this.repository = repository;
  }

  async isEnabled(organizationId: string, feature: FeatureKey): Promise<boolean> {
    const org = await this.repository.findById(organizationId);
    if (!org) return false;
    return isFeatureEnabled(org, feature);
  }

  async requireFeature(organizationId: string, feature: FeatureKey): Promise<void> {
    const enabled = await this.isEnabled(organizationId, feature);
    if (!enabled) {
      throw new ForbiddenError(
        `La función «${feature}» no está habilitada en el plan actual de tu entidad.`,
      );
    }
  }
}

export class OrganizationsService {
  private readonly repository: OrganizationsRepository;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly auditLog: AuditLog;
  public readonly featureGate: FeatureGate;

  constructor(params: {
    repository: OrganizationsRepository;
    idGenerator: IdGenerator;
    clock: Clock;
    auditLog: AuditLog;
  }) {
    this.repository = params.repository;
    this.idGenerator = params.idGenerator;
    this.clock = params.clock;
    this.auditLog = params.auditLog;
    this.featureGate = new FeatureGate(params.repository);
  }

  private assertPlatformAdmin(ctx: TenantContext): void {
    if (ctx.role !== 'platform_admin') {
      throw new ForbiddenError('Solo el administrador de plataforma puede gestionar entidades.');
    }
  }

  private assertOrgAdmin(ctx: TenantContext): string {
    const organizationId = requireOrganizationId(ctx);
    if (ctx.role !== 'org_admin') {
      throw new ForbiddenError('Solo el administrador de la entidad puede realizar este cambio.');
    }
    return organizationId;
  }

  async listAllOrganizations(ctx: TenantContext): Promise<OrganizationDto[]> {
    this.assertPlatformAdmin(ctx);
    const list = await this.repository.listAll();
    return list.map(toOrganizationDto);
  }

  async createOrganization(
    ctx: TenantContext,
    input: CreateOrganizationRequest,
  ): Promise<OrganizationDto> {
    this.assertPlatformAdmin(ctx);
    const existing = await this.repository.findBySlug(input.slug);
    if (existing) {
      throw new ConflictError(`Ya existe una entidad con el identificador «${input.slug}».`);
    }

    const now = this.clock.now();
    const org: Organization = {
      id: this.idGenerator.nextId(),
      name: input.name,
      slug: input.slug,
      type: input.type,
      plan: input.plan,
      features: mergeFeatureFlags(DEFAULT_FEATURE_FLAGS, input.features),
      logoUrl: null,
      timezone: 'America/Bogota',
      allowedEmailDomains: input.allowedEmailDomains,
      dataConsentVersion: input.dataConsentVersion,
      dataConsentText: input.dataConsentText,
      retentionDays: input.retentionDays,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.create(org);
    await this.auditLog.record({
      organizationId: org.id,
      actorUserId: ctx.userId,
      action: 'organization.created',
      targetType: 'organization',
      targetId: org.id,
      metadata: { slug: org.slug, plan: org.plan },
    });

    return toOrganizationDto(org);
  }

  async updateOrganizationByPlatform(
    ctx: TenantContext,
    organizationId: string,
    input: UpdateOrganizationRequest,
  ): Promise<OrganizationDto> {
    this.assertPlatformAdmin(ctx);
    const current = await this.repository.findById(organizationId);
    if (!current) {
      throw new NotFoundError('La entidad solicitada no existe.');
    }
    return this.applyOrganizationUpdate(ctx, current, input);
  }

  async getCurrentOrganization(ctx: TenantContext): Promise<OrganizationDto> {
    const organizationId = requireOrganizationId(ctx);
    const org = await this.repository.findById(organizationId);
    if (!org) {
      throw new NotFoundError('La entidad asociada al usuario no existe.');
    }
    return toOrganizationDto(org);
  }

  async updateCurrentOrganization(
    ctx: TenantContext,
    input: UpdateOrganizationRequest,
  ): Promise<OrganizationDto> {
    const organizationId = this.assertOrgAdmin(ctx);
    const current = await this.repository.findById(organizationId);
    if (!current) {
      throw new NotFoundError('La entidad asociada al usuario no existe.');
    }
    // Un org_admin no puede escalarse el plan ni las banderas de funciones por su cuenta.
    const sanitizedInput: UpdateOrganizationRequest = {
      ...input,
      plan: undefined,
      features: undefined,
    };
    return this.applyOrganizationUpdate(ctx, current, sanitizedInput);
  }

  private async applyOrganizationUpdate(
    ctx: TenantContext,
    current: Organization,
    input: UpdateOrganizationRequest,
  ): Promise<OrganizationDto> {
    const updated: Organization = {
      ...current,
      name: input.name ?? current.name,
      type: input.type ?? current.type,
      plan: input.plan ?? current.plan,
      features: input.features
        ? mergeFeatureFlags(current.features, input.features)
        : current.features,
      logoUrl: input.logoUrl !== undefined ? input.logoUrl : current.logoUrl,
      allowedEmailDomains: input.allowedEmailDomains ?? current.allowedEmailDomains,
      dataConsentVersion: input.dataConsentVersion ?? current.dataConsentVersion,
      dataConsentText: input.dataConsentText ?? current.dataConsentText,
      retentionDays: input.retentionDays ?? current.retentionDays,
      updatedAt: this.clock.now(),
    };

    await this.repository.update(updated);
    await this.auditLog.record({
      organizationId: updated.id,
      actorUserId: ctx.userId,
      action: 'organization.updated',
      targetType: 'organization',
      targetId: updated.id,
      metadata: { dataConsentVersion: updated.dataConsentVersion, plan: updated.plan },
    });

    return toOrganizationDto(updated);
  }

  async listSites(ctx: TenantContext): Promise<SiteDto[]> {
    const organizationId = requireOrganizationId(ctx);
    const sites = await this.repository.listSitesByOrganization(organizationId);
    return sites.map(toSiteDto);
  }

  async createSite(ctx: TenantContext, input: CreateSiteRequest): Promise<SiteDto> {
    const organizationId = this.assertOrgAdmin(ctx);
    const duplicateCode = await this.repository.findSiteByCode(organizationId, input.code);
    if (duplicateCode) {
      throw new ConflictError(`Ya existe una sede con el código «${input.code}» en tu entidad.`);
    }

    const now = this.clock.now();
    const site: Site = {
      id: this.idGenerator.nextId(),
      organizationId,
      name: input.name,
      code: input.code,
      address: input.address ?? null,
      loanPointCode: this.idGenerator.publicCode(8),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createSite(site);
    await this.auditLog.record({
      organizationId,
      actorUserId: ctx.userId,
      action: 'site.created',
      targetType: 'site',
      targetId: site.id,
      metadata: { code: site.code, loanPointCode: site.loanPointCode },
    });

    return toSiteDto(site);
  }

  async updateSite(ctx: TenantContext, siteId: string, input: UpdateSiteRequest): Promise<SiteDto> {
    const organizationId = this.assertOrgAdmin(ctx);
    const existing = await this.repository.findSiteById(organizationId, siteId);
    if (!existing) {
      throw new NotFoundError('La sede solicitada no existe en tu entidad.');
    }

    const updated: Site = {
      ...existing,
      name: input.name ?? existing.name,
      address: input.address !== undefined ? input.address : existing.address,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: this.clock.now(),
    };

    await this.repository.updateSite(updated);
    await this.auditLog.record({
      organizationId,
      actorUserId: ctx.userId,
      action: 'site.updated',
      targetType: 'site',
      targetId: updated.id,
      metadata: { isActive: updated.isActive },
    });

    return toSiteDto(updated);
  }

  async getByIdInternal(id: string): Promise<Organization | null> {
    return this.repository.findById(id);
  }

  async getBySlugInternal(slug: string): Promise<Organization | null> {
    return this.repository.findBySlug(slug);
  }

  async isEmailAllowedForOrganization(organizationId: string, email: string): Promise<boolean> {
    const org = await this.repository.findById(organizationId);
    if (!org) return false;
    return isEmailDomainAllowed(org, email);
  }
}
