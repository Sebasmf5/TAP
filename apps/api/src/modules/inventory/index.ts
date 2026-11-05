import type { ItemModelDto, InventoryUnitDto, UnitCondition, UnitStatus } from '@tap/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { AuditLog, Clock, DrizzleExecutor, IdGenerator } from '../../shared/index.ts';
import type { Organization } from '../organizations/index.ts';
import { InventoryService } from './application/use-cases.ts';
import {
  assertValidManualUnitStatusTransition,
  formatUnitCode,
  type InventoryCategoryEntity,
  type InventoryUnitEntity,
  type ItemModelEntity,
} from './domain/entities.ts';
import type { InventoryRepository } from './domain/ports.ts';
import { createInventoryRoutes, type AuthenticateRequestFn } from './http/routes.ts';
import { PdfKitUnitLabelsRenderer } from './infrastructure/labels-renderer.ts';
import {
  DrizzleInventoryRepository,
  InMemoryInventoryRepository,
} from './infrastructure/repository.ts';
import {
  inventoryCategoriesTable,
  inventorySchema,
  itemModelsTable,
  unitsTable,
} from './infrastructure/schema.ts';

export const MODULE_NAME = 'inventory' as const;

export interface InventoryModule {
  readonly repository: InventoryRepository;
  readonly service: InventoryService;
  listModelsInternal(organizationId: string): Promise<ItemModelDto[]>;
  listUnitsInternal(
    organizationId: string,
    filters?: { modelId?: string; status?: UnitStatus },
  ): Promise<InventoryUnitDto[]>;
  claimAvailableUnitForLoan(params: {
    organizationId: string;
    modelId: string;
    siteId?: string;
  }): Promise<{ unit: InventoryUnitEntity; model: ItemModelEntity } | null>;
  releaseUnitFromLoan(params: {
    organizationId: string;
    unitId: string;
    conditionIn: UnitCondition;
    notes?: string | null;
  }): Promise<InventoryUnitEntity | null>;
  findUnitByQrOrCode(organizationId: string, qrOrCode: string): Promise<InventoryUnitEntity | null>;
  findUnitById(organizationId: string, unitId: string): Promise<InventoryUnitEntity | null>;
  findModelById(organizationId: string, modelId: string): Promise<ItemModelEntity | null>;
  createRoutes(authenticate: AuthenticateRequestFn): FastifyPluginAsync;
}

export function createInventoryModule(deps: {
  db?: DrizzleExecutor;
  repository?: InventoryRepository;
  labelsRenderer?: PdfKitUnitLabelsRenderer;
  idGenerator: IdGenerator;
  clock: Clock;
  auditLog: AuditLog;
  findOrganizationById: (organizationId: string) => Promise<Organization | null>;
  assertFeatureEnabled: (organizationId: string, feature: 'loans') => Promise<void>;
}): InventoryModule {
  const repository =
    deps.repository ??
    (deps.db ? new DrizzleInventoryRepository(deps.db) : new InMemoryInventoryRepository());

  const labelsRenderer = deps.labelsRenderer ?? new PdfKitUnitLabelsRenderer();

  const service = new InventoryService({
    repository,
    labelsRenderer,
    idGenerator: deps.idGenerator,
    clock: deps.clock,
    auditLog: deps.auditLog,
    findOrganizationById: deps.findOrganizationById,
    assertFeatureEnabled: deps.assertFeatureEnabled,
  });

  return {
    repository,
    service,
    listModelsInternal: (organizationId) => service.listModelsInternal(organizationId),
    listUnitsInternal: (organizationId, filters) =>
      service.listUnitsInternal(organizationId, filters),
    claimAvailableUnitForLoan: (params) => service.claimAvailableUnitForLoanInternal(params),
    releaseUnitFromLoan: (params) => service.releaseUnitFromLoanInternal(params),
    findUnitByQrOrCode: (organizationId, qrOrCode) =>
      service.findUnitByQrOrCodeInternal(organizationId, qrOrCode),
    findUnitById: (organizationId, unitId) => service.findUnitByIdInternal(organizationId, unitId),
    findModelById: (organizationId, modelId) =>
      service.findModelByIdInternal(organizationId, modelId),
    createRoutes: (authenticate) => createInventoryRoutes({ service, authenticate }),
  };
}

export {
  DrizzleInventoryRepository,
  InMemoryInventoryRepository,
  InventoryService,
  PdfKitUnitLabelsRenderer,
  assertValidManualUnitStatusTransition,
  createInventoryRoutes,
  formatUnitCode,
  inventoryCategoriesTable,
  inventorySchema,
  itemModelsTable,
  unitsTable,
  type AuthenticateRequestFn,
  type InventoryCategoryEntity,
  type InventoryRepository,
  type InventoryUnitEntity,
  type ItemModelEntity,
};
