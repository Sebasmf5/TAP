import type { Organization, Site } from './entities.ts';

export interface OrganizationsRepository {
  findById(id: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  listAll(): Promise<Organization[]>;
  create(organization: Organization): Promise<void>;
  update(organization: Organization): Promise<void>;

  findSiteById(organizationId: string, siteId: string): Promise<Site | null>;
  findSiteByCode(organizationId: string, code: string): Promise<Site | null>;
  findSiteByLoanPointCode(loanPointCode: string): Promise<Site | null>;
  listSitesByOrganization(organizationId: string): Promise<Site[]>;
  createSite(site: Site): Promise<void>;
  updateSite(site: Site): Promise<void>;
}
