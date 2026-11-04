import type { OrganizationPlan, OrganizationType } from '@tap/contracts';
import { and, asc, eq } from 'drizzle-orm';
import type { DrizzleExecutor } from '../../../shared/index.ts';
import { mergeFeatureFlags, type Organization, type Site } from '../domain/entities.ts';
import type { OrganizationsRepository } from '../domain/ports.ts';
import { organizationsTable, sitesTable } from './schema.ts';

function mapOrganizationRow(row: typeof organizationsTable.$inferSelect): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type as OrganizationType,
    plan: row.plan as OrganizationPlan,
    features: mergeFeatureFlags(undefined, row.features),
    logoUrl: row.logoUrl,
    timezone: row.timezone,
    allowedEmailDomains: row.allowedEmailDomains ?? [],
    dataConsentVersion: row.dataConsentVersion,
    dataConsentText: row.dataConsentText,
    retentionDays: row.retentionDays,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSiteRow(row: typeof sitesTable.$inferSelect): Site {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    code: row.code,
    address: row.address,
    loanPointCode: row.loanPointCode,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleOrganizationsRepository implements OrganizationsRepository {
  private readonly db: DrizzleExecutor;

  constructor(db: DrizzleExecutor) {
    this.db = db;
  }

  async findById(id: string): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, id))
      .limit(1);
    return rows[0] ? mapOrganizationRow(rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, slug))
      .limit(1);
    return rows[0] ? mapOrganizationRow(rows[0]) : null;
  }

  async listAll(): Promise<Organization[]> {
    const rows = await this.db
      .select()
      .from(organizationsTable)
      .orderBy(asc(organizationsTable.name));
    return rows.map(mapOrganizationRow);
  }

  async create(organization: Organization): Promise<void> {
    await this.db.insert(organizationsTable).values({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      type: organization.type,
      plan: organization.plan,
      features: organization.features,
      logoUrl: organization.logoUrl,
      timezone: organization.timezone,
      allowedEmailDomains: [...organization.allowedEmailDomains],
      dataConsentVersion: organization.dataConsentVersion,
      dataConsentText: organization.dataConsentText,
      retentionDays: organization.retentionDays,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    });
  }

  async update(organization: Organization): Promise<void> {
    await this.db
      .update(organizationsTable)
      .set({
        name: organization.name,
        type: organization.type,
        plan: organization.plan,
        features: organization.features,
        logoUrl: organization.logoUrl,
        allowedEmailDomains: [...organization.allowedEmailDomains],
        dataConsentVersion: organization.dataConsentVersion,
        dataConsentText: organization.dataConsentText,
        retentionDays: organization.retentionDays,
        updatedAt: organization.updatedAt,
      })
      .where(eq(organizationsTable.id, organization.id));
  }

  async findSiteById(organizationId: string, siteId: string): Promise<Site | null> {
    // Filtrado obligatorio por organization_id en toda consulta de negocio (AGENTS.md A5.7).
    const rows = await this.db
      .select()
      .from(sitesTable)
      .where(and(eq(sitesTable.organizationId, organizationId), eq(sitesTable.id, siteId)))
      .limit(1);
    return rows[0] ? mapSiteRow(rows[0]) : null;
  }

  async findSiteByCode(organizationId: string, code: string): Promise<Site | null> {
    const rows = await this.db
      .select()
      .from(sitesTable)
      .where(and(eq(sitesTable.organizationId, organizationId), eq(sitesTable.code, code)))
      .limit(1);
    return rows[0] ? mapSiteRow(rows[0]) : null;
  }

  async findSiteByLoanPointCode(loanPointCode: string): Promise<Site | null> {
    const rows = await this.db
      .select()
      .from(sitesTable)
      .where(eq(sitesTable.loanPointCode, loanPointCode))
      .limit(1);
    return rows[0] ? mapSiteRow(rows[0]) : null;
  }

  async listSitesByOrganization(organizationId: string): Promise<Site[]> {
    const rows = await this.db
      .select()
      .from(sitesTable)
      .where(eq(sitesTable.organizationId, organizationId))
      .orderBy(asc(sitesTable.name));
    return rows.map(mapSiteRow);
  }

  async createSite(site: Site): Promise<void> {
    await this.db.insert(sitesTable).values({
      id: site.id,
      organizationId: site.organizationId,
      name: site.name,
      code: site.code,
      address: site.address,
      loanPointCode: site.loanPointCode,
      isActive: site.isActive,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
    });
  }

  async updateSite(site: Site): Promise<void> {
    await this.db
      .update(sitesTable)
      .set({
        name: site.name,
        address: site.address,
        isActive: site.isActive,
        updatedAt: site.updatedAt,
      })
      .where(and(eq(sitesTable.organizationId, site.organizationId), eq(sitesTable.id, site.id)));
  }
}

export class InMemoryOrganizationsRepository implements OrganizationsRepository {
  private readonly organizations = new Map<string, Organization>();
  private readonly sites = new Map<string, Site>();

  async findById(id: string): Promise<Organization | null> {
    return this.organizations.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    for (const org of this.organizations.values()) {
      if (org.slug === slug) return org;
    }
    return null;
  }

  async listAll(): Promise<Organization[]> {
    return [...this.organizations.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(organization: Organization): Promise<void> {
    this.organizations.set(organization.id, organization);
  }

  async update(organization: Organization): Promise<void> {
    this.organizations.set(organization.id, organization);
  }

  async findSiteById(organizationId: string, siteId: string): Promise<Site | null> {
    const site = this.sites.get(siteId);
    if (!site || site.organizationId !== organizationId) return null;
    return site;
  }

  async findSiteByCode(organizationId: string, code: string): Promise<Site | null> {
    for (const site of this.sites.values()) {
      if (site.organizationId === organizationId && site.code === code) return site;
    }
    return null;
  }

  async findSiteByLoanPointCode(loanPointCode: string): Promise<Site | null> {
    for (const site of this.sites.values()) {
      if (site.loanPointCode === loanPointCode) return site;
    }
    return null;
  }

  async listSitesByOrganization(organizationId: string): Promise<Site[]> {
    return [...this.sites.values()]
      .filter((site) => site.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createSite(site: Site): Promise<void> {
    this.sites.set(site.id, site);
  }

  async updateSite(site: Site): Promise<void> {
    const existing = this.sites.get(site.id);
    if (!existing || existing.organizationId !== site.organizationId) return;
    this.sites.set(site.id, site);
  }
}
