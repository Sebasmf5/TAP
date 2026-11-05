import {
  ListNotificationsResponseSchema,
  NotificationDtoSchema,
  NotificationStatusSchema,
} from '@tap/contracts';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TenantContext } from '../../../shared/index.ts';
import type { NotificationsService } from '../application/use-cases.ts';

export type AuthenticateRequestFn = (req: FastifyRequest) => Promise<TenantContext>;

export function createNotificationsRoutes(deps: {
  service: NotificationsService;
  authenticate: AuthenticateRequestFn;
}): FastifyPluginAsync {
  return async function notificationsRoutes(app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.get(
      '/notifications',
      {
        schema: {
          tags: ['notifications'],
          summary: 'Lista el registro de notificaciones enviadas, en cola y fallidas de la entidad',
          querystring: z.object({
            status: NotificationStatusSchema.optional(),
          }),
          response: {
            200: ListNotificationsResponseSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.listNotifications(actor, { status: req.query.status });
      },
    );

    typed.post(
      '/notifications/:id/retry',
      {
        schema: {
          tags: ['notifications'],
          summary: 'Reintenta el envío de una notificación en cola o fallida',
          params: z.object({ id: z.uuid() }),
          response: {
            200: NotificationDtoSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.retryNotification(actor, req.params.id);
      },
    );
  };
}
