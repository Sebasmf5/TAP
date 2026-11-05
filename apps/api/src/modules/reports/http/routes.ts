import { DashboardSummaryResponseSchema, ExportReportQuerySchema } from '@tap/contracts';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { TenantContext } from '../../../shared/index.ts';
import type { ReportsService } from '../application/use-cases.ts';

export type AuthenticateRequestFn = (req: FastifyRequest) => Promise<TenantContext>;

export function createReportsRoutes(deps: {
  service: ReportsService;
  authenticate: AuthenticateRequestFn;
}): FastifyPluginAsync {
  return async function reportsRoutes(app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.get(
      '/reports/dashboard',
      {
        schema: {
          tags: ['reports'],
          summary:
            'Obtiene los indicadores consolidados y series de estadísticas para el tablero de la entidad',
          response: {
            200: DashboardSummaryResponseSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.getDashboardSummary(actor);
      },
    );

    typed.get(
      '/reports/export',
      {
        schema: {
          tags: ['reports'],
          summary:
            'Descarga un reporte en formato CSV, Excel (.xlsx) o PDF con enmascarado de documentos según el rol',
          querystring: ExportReportQuerySchema,
        },
      },
      async (req, reply) => {
        const actor = await deps.authenticate(req);
        const { filename, contentType, buffer } = await deps.service.exportReport(actor, req.query);
        return reply
          .header('Content-Type', contentType)
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(buffer);
      },
    );
  };
}
