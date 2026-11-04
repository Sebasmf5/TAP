import {
  CreateOrganizationRequestSchema,
  CreateSiteRequestSchema,
  OrganizationDtoSchema,
  ProblemDetailsSchema,
  SiteDtoSchema,
  UpdateOrganizationRequestSchema,
  UpdateSiteRequestSchema,
} from '@tap/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TenantContext } from '../../../shared/index.ts';
import type { OrganizationsService } from '../application/use-cases.ts';

export type AuthenticateRequestFn = (request: FastifyRequest) => Promise<TenantContext>;

const IdParamSchema = z.object({
  id: z.uuid(),
});

export function createOrganizationsRoutes(params: {
  service: OrganizationsService;
  authenticate: AuthenticateRequestFn;
}) {
  return async function organizationsRoutes(app: FastifyInstance): Promise<void> {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.get(
      '/platform/organizations',
      {
        schema: {
          response: {
            200: z.array(OrganizationDtoSchema),
            401: ProblemDetailsSchema,
            403: ProblemDetailsSchema,
          },
        },
      },
      async (request) => {
        const ctx = await params.authenticate(request);
        return params.service.listAllOrganizations(ctx);
      },
    );

    typed.post(
      '/platform/organizations',
      {
        schema: {
          body: CreateOrganizationRequestSchema,
          response: {
            201: OrganizationDtoSchema,
            400: ProblemDetailsSchema,
            401: ProblemDetailsSchema,
            403: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
          },
        },
      },
      async (request, reply) => {
        const ctx = await params.authenticate(request);
        const created = await params.service.createOrganization(ctx, request.body);
        return reply.status(201).send(created);
      },
    );

    typed.patch(
      '/platform/organizations/:id',
      {
        schema: {
          params: IdParamSchema,
          body: UpdateOrganizationRequestSchema,
          response: {
            200: OrganizationDtoSchema,
            400: ProblemDetailsSchema,
            401: ProblemDetailsSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
          },
        },
      },
      async (request) => {
        const ctx = await params.authenticate(request);
        return params.service.updateOrganizationByPlatform(ctx, request.params.id, request.body);
      },
    );

    typed.get(
      '/organization',
      {
        schema: {
          response: {
            200: OrganizationDtoSchema,
            401: ProblemDetailsSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
          },
        },
      },
      async (request) => {
        const ctx = await params.authenticate(request);
        return params.service.getCurrentOrganization(ctx);
      },
    );

    typed.patch(
      '/organization',
      {
        schema: {
          body: UpdateOrganizationRequestSchema,
          response: {
            200: OrganizationDtoSchema,
            400: ProblemDetailsSchema,
            401: ProblemDetailsSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
          },
        },
      },
      async (request) => {
        const ctx = await params.authenticate(request);
        return params.service.updateCurrentOrganization(ctx, request.body);
      },
    );

    typed.get(
      '/sites',
      {
        schema: {
          response: {
            200: z.array(SiteDtoSchema),
            401: ProblemDetailsSchema,
            403: ProblemDetailsSchema,
          },
        },
      },
      async (request) => {
        const ctx = await params.authenticate(request);
        return params.service.listSites(ctx);
      },
    );

    typed.post(
      '/sites',
      {
        schema: {
          body: CreateSiteRequestSchema,
          response: {
            201: SiteDtoSchema,
            400: ProblemDetailsSchema,
            401: ProblemDetailsSchema,
            403: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
          },
        },
      },
      async (request, reply) => {
        const ctx = await params.authenticate(request);
        const created = await params.service.createSite(ctx, request.body);
        return reply.status(201).send(created);
      },
    );

    typed.patch(
      '/sites/:id',
      {
        schema: {
          params: IdParamSchema,
          body: UpdateSiteRequestSchema,
          response: {
            200: SiteDtoSchema,
            400: ProblemDetailsSchema,
            401: ProblemDetailsSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
          },
        },
      },
      async (request) => {
        const ctx = await params.authenticate(request);
        return params.service.updateSite(ctx, request.params.id, request.body);
      },
    );
  };
}
