import {
  BulkCreateUnitsRequestSchema,
  CreateInventoryCategoryRequestSchema,
  CreateItemModelRequestSchema,
  GenerateUnitLabelsPdfRequestSchema,
  InventoryCategoryDtoSchema,
  InventoryUnitDtoSchema,
  ItemModelDtoSchema,
  UnitStatusSchema,
  UpdateUnitStatusRequestSchema,
} from '@tap/contracts';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TenantContext } from '../../../shared/index.ts';
import type { InventoryService } from '../application/use-cases.ts';

export type AuthenticateRequestFn = (req: FastifyRequest) => Promise<TenantContext>;

export function createInventoryRoutes(deps: {
  service: InventoryService;
  authenticate: AuthenticateRequestFn;
}): FastifyPluginAsync {
  return async function inventoryRoutes(app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.get(
      '/inventory/categories',
      {
        schema: {
          tags: ['inventory'],
          summary: 'Lista las categorías de implementos de la entidad',
          response: {
            200: z.array(InventoryCategoryDtoSchema),
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.listCategories(actor);
      },
    );

    typed.post(
      '/inventory/categories',
      {
        schema: {
          tags: ['inventory'],
          summary: 'Crea una categoría de implementos con plazo de préstamo por defecto',
          body: CreateInventoryCategoryRequestSchema,
          response: {
            201: InventoryCategoryDtoSchema,
          },
        },
      },
      async (req, reply) => {
        const actor = await deps.authenticate(req);
        const created = await deps.service.createCategory(actor, req.body);
        return reply.status(201).send(created);
      },
    );

    typed.get(
      '/inventory/models',
      {
        schema: {
          tags: ['inventory'],
          summary: 'Lista el catálogo de modelos de implementos con conteo de stock',
          response: {
            200: z.array(ItemModelDtoSchema),
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.listModels(actor);
      },
    );

    typed.post(
      '/inventory/models',
      {
        schema: {
          tags: ['inventory'],
          summary: 'Crea un modelo de implemento (ej: Balón de Futsal FIFA)',
          body: CreateItemModelRequestSchema,
          response: {
            201: ItemModelDtoSchema,
          },
        },
      },
      async (req, reply) => {
        const actor = await deps.authenticate(req);
        const created = await deps.service.createModel(actor, req.body);
        return reply.status(201).send(created);
      },
    );

    typed.get(
      '/inventory/units',
      {
        schema: {
          tags: ['inventory'],
          summary: 'Lista las unidades físicas con su código, QR, estado y condición',
          querystring: z.object({
            modelId: z.uuid().optional(),
            status: UnitStatusSchema.optional(),
          }),
          response: {
            200: z.array(InventoryUnitDtoSchema),
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.listUnits(actor, {
          modelId: req.query.modelId,
          status: req.query.status,
        });
      },
    );

    typed.post(
      '/inventory/models/:modelId/units/bulk',
      {
        schema: {
          tags: ['inventory'],
          summary: 'Alta masiva de unidades numeradas (ej: BAL-001 .. BAL-020) con QR único',
          params: z.object({ modelId: z.uuid() }),
          body: BulkCreateUnitsRequestSchema,
          response: {
            201: z.array(InventoryUnitDtoSchema),
          },
        },
      },
      async (req, reply) => {
        const actor = await deps.authenticate(req);
        const created = await deps.service.bulkCreateUnits(actor, req.params.modelId, req.body);
        return reply.status(201).send(created);
      },
    );

    typed.patch(
      '/inventory/units/:unitId/status',
      {
        schema: {
          tags: ['inventory'],
          summary: 'Actualiza el estado o condición de una unidad con registro en auditoría',
          params: z.object({ unitId: z.uuid() }),
          body: UpdateUnitStatusRequestSchema,
          response: {
            200: InventoryUnitDtoSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.updateUnitStatus(actor, req.params.unitId, req.body);
      },
    );

    typed.post(
      '/inventory/units/labels-pdf',
      {
        schema: {
          tags: ['inventory'],
          summary: 'Genera una hoja PDF A4 imprimible con las etiquetas QR de las unidades',
          body: GenerateUnitLabelsPdfRequestSchema,
        },
      },
      async (req, reply) => {
        const actor = await deps.authenticate(req);
        const pdfBuffer = await deps.service.generateLabelsPdf(actor, req.body);
        return reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', 'attachment; filename="etiquetas_qr_inventario.pdf"')
          .send(pdfBuffer);
      },
    );
  };
}
