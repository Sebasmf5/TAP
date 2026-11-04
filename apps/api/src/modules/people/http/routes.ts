import {
  CreatePersonRequestSchema,
  ImportPeopleRequestSchema,
  ImportPeopleResponseSchema,
  PersonDtoSchema,
  UpdatePersonRequestSchema,
} from '@tap/contracts';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TenantContext } from '../../../shared/index.ts';
import type { PeopleService } from '../application/use-cases.ts';

export type AuthenticateRequestFn = (req: FastifyRequest) => Promise<TenantContext>;

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip.trim(), 'utf8').digest('hex').slice(0, 32);
}

export function createPeopleRoutes(deps: {
  service: PeopleService;
  authenticate: AuthenticateRequestFn;
}): FastifyPluginAsync {
  return async function peopleRoutes(app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.get(
      '/people',
      {
        schema: {
          tags: ['people'],
          summary: 'Lista y busca participantes en el directorio de la entidad actual',
          querystring: z.object({
            q: z.string().optional(),
          }),
          response: {
            200: z.array(PersonDtoSchema),
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.listPeople(ctx, req.query.q);
      },
    );

    typed.get(
      '/people/:id',
      {
        schema: {
          tags: ['people'],
          summary: 'Obtiene el detalle de un participante de la entidad',
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: PersonDtoSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.getPersonById(ctx, req.params.id);
      },
    );

    typed.post(
      '/people',
      {
        schema: {
          tags: ['people'],
          summary: 'Registra un participante en el directorio de la entidad',
          body: CreatePersonRequestSchema,
          response: {
            201: PersonDtoSchema,
          },
        },
      },
      async (req, reply) => {
        const ctx = await deps.authenticate(req);
        const created = await deps.service.createPerson(ctx, req.body, hashIp(req.ip));
        return reply.status(201).send(created);
      },
    );

    typed.patch(
      '/people/:id',
      {
        schema: {
          tags: ['people'],
          summary: 'Actualiza los datos de un participante de la entidad',
          params: z.object({ id: z.string().uuid() }),
          body: UpdatePersonRequestSchema,
          response: {
            200: PersonDtoSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.updatePerson(ctx, req.params.id, req.body);
      },
    );

    typed.post(
      '/people/import',
      {
        schema: {
          tags: ['people'],
          summary:
            'Importa participantes por CSV con vista previa (dryRun) y reporte de errores fila por fila',
          body: ImportPeopleRequestSchema,
          response: {
            200: ImportPeopleResponseSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.importPeopleCsv(ctx, req.body);
      },
    );

    typed.post(
      '/people/:id/rotate-qr',
      {
        schema: {
          tags: ['people'],
          summary: 'Rota el token QR único del carné de un participante (auditado)',
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: PersonDtoSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.rotateQrToken(ctx, req.params.id);
      },
    );
  };
}
