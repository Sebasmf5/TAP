import type { FastifyPluginAsync } from 'fastify';
import type { AuditLog } from '../../shared/index.ts';
import { ReportsService } from './application/use-cases.ts';
import { createReportsRoutes, type AuthenticateRequestFn } from './http/routes.ts';
import { reportRunsTable, reportsSchema } from './infrastructure/schema.ts';

export const MODULE_NAME = 'reports' as const;

export interface ReportsModule {
  readonly service: ReportsService;
  createRoutes(authenticate: AuthenticateRequestFn): FastifyPluginAsync;
}

export function createReportsModule(deps: {
  auditLog: AuditLog;
  findOrganizationById: ConstructorParameters<typeof ReportsService>[0]['findOrganizationById'];
  assertFeatureEnabled: ConstructorParameters<typeof ReportsService>[0]['assertFeatureEnabled'];
  listEvents: ConstructorParameters<typeof ReportsService>[0]['listEvents'];
  listValidAttendanceByEvent: ConstructorParameters<
    typeof ReportsService
  >[0]['listValidAttendanceByEvent'];
  listCertificatesByEvent: ConstructorParameters<
    typeof ReportsService
  >[0]['listCertificatesByEvent'];
  listInventoryModels: ConstructorParameters<typeof ReportsService>[0]['listInventoryModels'];
  listInventoryUnits: ConstructorParameters<typeof ReportsService>[0]['listInventoryUnits'];
  listLoans: ConstructorParameters<typeof ReportsService>[0]['listLoans'];
  findPersonById: ConstructorParameters<typeof ReportsService>[0]['findPersonById'];
}): ReportsModule {
  const service = new ReportsService(deps);

  return {
    service,
    createRoutes: (authenticate) => createReportsRoutes({ service, authenticate }),
  };
}

export {
  ReportsService,
  createReportsRoutes,
  reportRunsTable,
  reportsSchema,
  type AuthenticateRequestFn,
};
