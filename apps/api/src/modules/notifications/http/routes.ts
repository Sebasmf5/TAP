import {
  ListNotificationsResponseSchema,
  MarketingCampaignRequestSchema,
  MarketingCampaignResponseSchema,
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

    typed.post(
      '/notifications/marketing-campaign',
      {
        schema: {
          tags: ['notifications'],
          summary:
            'Envía una campaña publicitaria de la entidad solo a participantes con consentimiento vigente (Ley 2300)',
          body: MarketingCampaignRequestSchema,
          response: {
            200: MarketingCampaignResponseSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.sendMarketingCampaign(actor, req.body);
      },
    );

    typed.get(
      '/public/marketing-unsubscribe',
      {
        schema: {
          tags: ['notifications'],
          summary: 'Cancela la suscripción publicitaria en 1 clic conforme a la Ley 2300 de 2023',
          querystring: z.object({
            org: z.uuid(),
            token: z.string().trim().min(6).max(64),
          }),
        },
      },
      async (req, reply) => {
        await deps.service.unsubscribeMarketingRecipient({
          organizationId: req.query.org,
          qrToken: req.query.token,
        });
        return reply
          .type('text/html; charset=utf-8')
          .send(
            '<!doctype html><html lang="es-CO"><body style="font-family:Inter,sans-serif;padding:32px;color:#061b31;"><h1>Suscripción publicitaria cancelada</h1><p>No recibirás más mensajes comerciales de esta entidad (Ley 2300 de 2023).</p></body></html>',
          );
      },
    );
  };
}
