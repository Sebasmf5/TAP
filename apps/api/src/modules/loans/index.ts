import type { LoanDto, LoanStatus } from '@tap/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type {
  AuditLog,
  Clock,
  DrizzleExecutor,
  EventBus,
  FileStorage,
  IdGenerator,
} from '../../shared/index.ts';
import type { Organization } from '../organizations/index.ts';
import { LoansService } from './application/use-cases.ts';
import {
  DefaultBorrowerEligibilityStrategy,
  StandardLoanDurationPolicyStrategy,
  assertValidLoanTransition,
  type BorrowerEligibilityStrategy,
  type LendingPointEntity,
  type LoanDurationPolicyStrategy,
  type LoanEntity,
} from './domain/entities.ts';
import type { LoansRepository } from './domain/ports.ts';
import { createLoansRoutes, type AuthenticateRequestFn } from './http/routes.ts';
import { PdfKitLoanReceiptRenderer } from './infrastructure/receipt-renderer.ts';
import { DrizzleLoansRepository, InMemoryLoansRepository } from './infrastructure/repository.ts';
import { lendingPointsTable, loansSchema, loansTable } from './infrastructure/schema.ts';

export const MODULE_NAME = 'loans' as const;

export interface LoansModule {
  readonly repository: LoansRepository;
  readonly service: LoansService;
  listLoansInternal(organizationId: string, filters?: { status?: LoanStatus }): Promise<LoanDto[]>;
  createRoutes(authenticate: AuthenticateRequestFn): FastifyPluginAsync;
}

export function createLoansModule(deps: {
  db?: DrizzleExecutor;
  repository?: LoansRepository;
  receiptRenderer?: PdfKitLoanReceiptRenderer;
  fileStorage: FileStorage;
  idGenerator: IdGenerator;
  clock: Clock;
  eventBus: EventBus;
  auditLog: AuditLog;
  findOrganizationById: (organizationId: string) => Promise<Organization | null>;
  assertFeatureEnabled: (organizationId: string, feature: 'loans') => Promise<void>;
  inventoryGateway: ConstructorParameters<typeof LoansService>[0]['inventoryGateway'];
  personGateway: ConstructorParameters<typeof LoansService>[0]['personGateway'];
}): LoansModule {
  const repository =
    deps.repository ??
    (deps.db ? new DrizzleLoansRepository(deps.db) : new InMemoryLoansRepository());

  const receiptRenderer = deps.receiptRenderer ?? new PdfKitLoanReceiptRenderer();

  const service = new LoansService({
    repository,
    receiptRenderer,
    fileStorage: deps.fileStorage,
    idGenerator: deps.idGenerator,
    clock: deps.clock,
    eventBus: deps.eventBus,
    auditLog: deps.auditLog,
    findOrganizationById: deps.findOrganizationById,
    assertFeatureEnabled: deps.assertFeatureEnabled,
    inventoryGateway: deps.inventoryGateway,
    personGateway: deps.personGateway,
  });

  return {
    repository,
    service,
    listLoansInternal: (organizationId, filters) =>
      service.listLoansInternal(organizationId, filters),
    createRoutes: (authenticate) => createLoansRoutes({ service, authenticate }),
  };
}

export {
  DefaultBorrowerEligibilityStrategy,
  DrizzleLoansRepository,
  InMemoryLoansRepository,
  LoansService,
  PdfKitLoanReceiptRenderer,
  StandardLoanDurationPolicyStrategy,
  assertValidLoanTransition,
  createLoansRoutes,
  lendingPointsTable,
  loansSchema,
  loansTable,
  type AuthenticateRequestFn,
  type BorrowerEligibilityStrategy,
  type LendingPointEntity,
  type LoanDurationPolicyStrategy,
  type LoanEntity,
  type LoansRepository,
};
