import {
  CreateEventRequestSchema,
  EventDtoSchema,
  EventQrResponseSchema,
  EventStatusSchema,
  UpdateEventRequestSchema,
} from '@tap/contracts';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TenantContext } from '../../../shared/index.ts';
import type { EventsService } from '../application/use-cases.ts';

export type AuthenticateRequestFn = (req: FastifyRequest) => Promise<TenantContext>;

export function createEventsRoutes(deps: {
  service: EventsService;
  authenticate: AuthenticateRequestFn;
}): FastifyPluginAsync {
  return async function eventsRoutes(app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.get(
      '/events',
      {
        schema: {
          tags: ['events'],
          summary: 'Lista los eventos de la entidad actual con filtro opcional por estado',
          querystring: z.object({
            status: EventStatusSchema.optional(),
          }),
          response: {
            200: z.array(EventDtoSchema),
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.listEvents(ctx, req.query.status);
      },
    );

    typed.get(
      '/events/:id',
      {
        schema: {
          tags: ['events'],
          summary: 'Obtiene el detalle de un evento y sus sesiones',
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: EventDtoSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.getEventById(ctx, req.params.id);
      },
    );

    typed.post(
      '/events',
      {
        schema: {
          tags: ['events'],
          summary: 'Crea un evento usando EventFactory y EventBuilder',
          body: CreateEventRequestSchema,
          response: {
            201: EventDtoSchema,
          },
        },
      },
      async (req, reply) => {
        const ctx = await deps.authenticate(req);
        const created = await deps.service.createEvent(ctx, req.body);
        return reply.status(201).send(created);
      },
    );

    typed.patch(
      '/events/:id',
      {
        schema: {
          tags: ['events'],
          summary: 'Actualiza un evento (solo permitido en draft o scheduled)',
          params: z.object({ id: z.string().uuid() }),
          body: UpdateEventRequestSchema,
          response: {
            200: EventDtoSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.updateEvent(ctx, req.params.id, req.body);
      },
    );

    typed.post(
      '/events/:id/publish',
      {
        schema: {
          tags: ['events'],
          summary: 'Publica un evento (draft → scheduled) y emite event.published',
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: EventDtoSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.transitionState(ctx, req.params.id, 'publish');
      },
    );

    typed.post(
      '/events/:id/open',
      {
        schema: {
          tags: ['events'],
          summary: 'Abre un evento para registro de asistencia (draft|scheduled → open)',
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: EventDtoSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.transitionState(ctx, req.params.id, 'open');
      },
    );

    typed.post(
      '/events/:id/close',
      {
        schema: {
          tags: ['events'],
          summary: 'Cierra un evento abierto (open → closed) y emite event.closed',
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: EventDtoSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.transitionState(ctx, req.params.id, 'close');
      },
    );

    typed.post(
      '/events/:id/cancel',
      {
        schema: {
          tags: ['events'],
          summary: 'Cancela un evento (draft|scheduled|open → cancelled)',
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: EventDtoSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.transitionState(ctx, req.params.id, 'cancel');
      },
    );

    typed.post(
      '/events/:id/duplicate',
      {
        schema: {
          tags: ['events'],
          summary: 'Duplica la configuración y sesiones de un evento en estado draft (Prototype)',
          params: z.object({ id: z.string().uuid() }),
          body: z
            .object({
              newName: z.string().trim().min(3).max(160).optional(),
            })
            .optional(),
          response: {
            201: EventDtoSchema,
          },
        },
      },
      async (req, reply) => {
        const ctx = await deps.authenticate(req);
        const duplicated = await deps.service.duplicateEvent(ctx, req.params.id, req.body?.newName);
        return reply.status(201).send(duplicated);
      },
    );

    typed.get(
      '/events/:id/qr',
      {
        schema: {
          tags: ['events'],
          summary: 'Obtiene el código QR del evento en PNG (Data URL) y SVG',
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: EventQrResponseSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.getEventQr(ctx, req.params.id);
      },
    );

    typed.get(
      '/events/:id/poster.pdf',
      {
        schema: {
          tags: ['events'],
          summary: 'Genera el afiche imprimible en PDF con el código QR del evento',
          params: z.object({ id: z.string().uuid() }),
        },
      },
      async (req, reply) => {
        const ctx = await deps.authenticate(req);
        const { filename, pdfBuffer } = await deps.service.renderEventPosterPdf(ctx, req.params.id);
        return reply
          .header('content-type', 'application/pdf')
          .header('content-disposition', `attachment; filename="${filename}"`)
          .send(pdfBuffer);
      },
    );
  };
}
