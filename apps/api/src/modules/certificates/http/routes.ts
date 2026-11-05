import {
  CertificateDtoSchema,
  CertificateTemplateDtoSchema,
  CreateCertificateTemplateRequestSchema,
  EvaluateEventCertificatesResponseSchema,
  IssueEventCertificatesRequestSchema,
  IssueEventCertificatesResponseSchema,
  PreviewCertificateTemplateRequestSchema,
  PublicCertificateVerificationResponseSchema,
  RevokeCertificateRequestSchema,
  UpdateCertificateTemplateRequestSchema,
} from '@tap/contracts';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TenantContext } from '../../../shared/index.ts';
import type { CertificatesService } from '../application/use-cases.ts';

export type AuthenticateRequestFn = (req: FastifyRequest) => Promise<TenantContext>;

export function createCertificatesRoutes(deps: {
  service: CertificatesService;
  authenticate: AuthenticateRequestFn;
}): FastifyPluginAsync {
  return async function certificatesRoutes(app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    // =========================================================================
    // Flujo público de verificación de certificados (`/v/:code`)
    // =========================================================================

    typed.get(
      '/public/certificates/verify/:code',
      {
        schema: {
          tags: ['certificates'],
          summary:
            'Verifica la autenticidad y vigencia de un certificado por código público sin exponer documento',
          params: z.object({
            code: z.string().trim().min(4).max(32),
          }),
          response: {
            200: PublicCertificateVerificationResponseSchema,
          },
        },
      },
      async (req) => {
        return deps.service.verifyCertificatePublic(req.params.code);
      },
    );

    // =========================================================================
    // Plantillas de certificados (funcionario autenticado)
    // =========================================================================

    typed.get(
      '/certificate-templates',
      {
        schema: {
          tags: ['certificates'],
          summary: 'Lista las plantillas de certificado de la entidad',
          response: {
            200: z.array(CertificateTemplateDtoSchema),
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.listTemplates(actor);
      },
    );

    typed.post(
      '/certificate-templates',
      {
        schema: {
          tags: ['certificates'],
          summary: 'Crea una nueva plantilla de certificado',
          body: CreateCertificateTemplateRequestSchema,
          response: {
            201: CertificateTemplateDtoSchema,
          },
        },
      },
      async (req, reply) => {
        const actor = await deps.authenticate(req);
        const created = await deps.service.createTemplate(actor, req.body);
        return reply.status(201).send(created);
      },
    );

    typed.patch(
      '/certificate-templates/:id',
      {
        schema: {
          tags: ['certificates'],
          summary: 'Actualiza e incrementa versión de una plantilla de certificado',
          params: z.object({ id: z.uuid() }),
          body: UpdateCertificateTemplateRequestSchema,
          response: {
            200: CertificateTemplateDtoSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.updateTemplate(actor, req.params.id, req.body);
      },
    );

    typed.post(
      '/certificate-templates/:id/preview',
      {
        schema: {
          tags: ['certificates'],
          summary: 'Genera una vista previa en PDF de la plantilla de certificado',
          params: z.object({ id: z.uuid() }),
          body: PreviewCertificateTemplateRequestSchema,
        },
      },
      async (req, reply) => {
        const actor = await deps.authenticate(req);
        const { buffer, filename } = await deps.service.previewTemplatePdf(
          actor,
          req.params.id,
          req.body,
        );
        return reply
          .header('content-type', 'application/pdf')
          .header('content-disposition', `attachment; filename="${filename}"`)
          .send(buffer);
      },
    );

    // =========================================================================
    // Evaluación, emisión en lote, descarga, reenvío y revocación
    // =========================================================================

    typed.post(
      '/events/:id/certificates/evaluate',
      {
        schema: {
          tags: ['certificates'],
          summary:
            'Evalúa elegibilidad de asistentes del evento según su regla de certificado (Strategy)',
          params: z.object({ id: z.uuid() }),
          response: {
            200: EvaluateEventCertificatesResponseSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.evaluateEventEligibility(actor, req.params.id);
      },
    );

    typed.post(
      '/events/:id/certificates/issue',
      {
        schema: {
          tags: ['certificates'],
          summary: 'Emite certificados en lote de forma idempotente para los asistentes elegibles',
          params: z.object({ id: z.uuid() }),
          body: IssueEventCertificatesRequestSchema,
          response: {
            200: IssueEventCertificatesResponseSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.issueEventCertificates(actor, req.params.id, req.body);
      },
    );

    typed.get(
      '/events/:id/certificates',
      {
        schema: {
          tags: ['certificates'],
          summary: 'Lista los certificados emitidos y revocados de un evento',
          params: z.object({ id: z.uuid() }),
          response: {
            200: z.array(CertificateDtoSchema),
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.listEventCertificates(actor, req.params.id);
      },
    );

    typed.get(
      '/certificates/:id/pdf',
      {
        schema: {
          tags: ['certificates'],
          summary: 'Descarga el PDF oficial del certificado con código QR embebido',
          params: z.object({ id: z.uuid() }),
        },
      },
      async (req, reply) => {
        const actor = await deps.authenticate(req);
        const { buffer, filename } = await deps.service.downloadCertificatePdf(
          actor,
          req.params.id,
        );
        return reply
          .header('content-type', 'application/pdf')
          .header('content-disposition', `attachment; filename="${filename}"`)
          .send(buffer);
      },
    );

    typed.post(
      '/certificates/:id/revoke',
      {
        schema: {
          tags: ['certificates'],
          summary: 'Revoca un certificado emitido dejando registro en AuditLog',
          params: z.object({ id: z.uuid() }),
          body: RevokeCertificateRequestSchema,
          response: {
            200: CertificateDtoSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.revokeCertificate(actor, req.params.id, req.body);
      },
    );

    typed.post(
      '/certificates/:id/resend',
      {
        schema: {
          tags: ['certificates'],
          summary: 'Reenvía por correo la notificación del certificado al titular',
          params: z.object({ id: z.uuid() }),
          response: {
            200: CertificateDtoSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.resendCertificate(actor, req.params.id);
      },
    );
  };
}
