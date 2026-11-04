import type { FeatureKey, OrganizationDto } from '@tap/contracts';
import type { AuditLog, Clock, DrizzleExecutor, IdGenerator } from '../../shared/index.ts';
import { FeatureGate, OrganizationsService } from './application/use-cases.ts';
import {
  DEFAULT_FEATURE_FLAGS,
  isEmailDomainAllowed,
  isFeatureEnabled,
  mergeFeatureFlags,
  toOrganizationDto,
  toSiteDto,
  type Organization,
  type Site,
} from './domain/entities.ts';
import type { OrganizationsRepository } from './domain/ports.ts';
import { createOrganizationsRoutes, type AuthenticateRequestFn } from './http/routes.ts';
import {
  DrizzleOrganizationsRepository,
  InMemoryOrganizationsRepository,
} from './infrastructure/repository.ts';
import { organizationsSchema, organizationsTable, sitesTable } from './infrastructure/schema.ts';

export interface OrganizationsModule {
  readonly service: OrganizationsService;
  readonly featureGate: FeatureGate;
  readonly repository: OrganizationsRepository;
  getOrganizationById(id: string): Promise<OrganizationDto | null>;
  getOrganizationBySlug(slug: string): Promise<OrganizationDto | null>;
  isEmailAllowed(organizationId: string, email: string): Promise<boolean>;
  requireFeature(organizationId: string, feature: FeatureKey): Promise<void>;
  createRoutes(authenticate: AuthenticateRequestFn): ReturnType<typeof createOrganizationsRoutes>;
}

export function createOrganizationsModule(params: {
  db?: DrizzleExecutor;
  repository?: OrganizationsRepository;
  idGenerator: IdGenerator;
  clock: Clock;
  auditLog: AuditLog;
}): OrganizationsModule {
  const repository =
    params.repository ??
    (params.db
      ? new DrizzleOrganizationsRepository(params.db)
      : new InMemoryOrganizationsRepository());

  const service = new OrganizationsService({
    repository,
    idGenerator: params.idGenerator,
    clock: params.clock,
    auditLog: params.auditLog,
  });

  return {
    service,
    featureGate: service.featureGate,
    repository,
    async getOrganizationById(id: string) {
      const org = await service.getByIdInternal(id);
      return org ? toOrganizationDto(org) : null;
    },
    async getOrganizationBySlug(slug: string) {
      const org = await service.getBySlugInternal(slug);
      return org ? toOrganizationDto(org) : null;
    },
    async isEmailAllowed(organizationId: string, email: string) {
      return service.isEmailAllowedForOrganization(organizationId, email);
    },
    async requireFeature(organizationId: string, feature: FeatureKey) {
      await service.featureGate.requireFeature(organizationId, feature);
    },
    createRoutes(authenticate: AuthenticateRequestFn) {
      return createOrganizationsRoutes({ service, authenticate });
    },
  };
}

export {
  DEFAULT_FEATURE_FLAGS,
  DrizzleOrganizationsRepository,
  FeatureGate,
  InMemoryOrganizationsRepository,
  OrganizationsService,
  createOrganizationsRoutes,
  isEmailDomainAllowed,
  isFeatureEnabled,
  mergeFeatureFlags,
  organizationsSchema,
  organizationsTable,
  sitesTable,
  toOrganizationDto,
  toSiteDto,
  type AuthenticateRequestFn,
  type Organization,
  type OrganizationsRepository,
  type Site,
};
