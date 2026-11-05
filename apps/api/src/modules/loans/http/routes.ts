import {
  CreateLendingPointRequestSchema,
  LendingPointDtoSchema,
  LoanDtoSchema,
  LoanStatusSchema,
  OverdueSweepResponseSchema,
  PublicBorrowerLookupRequestSchema,
  PublicBorrowerLookupResponseSchema,
  PublicLendingPointInfoSchema,
  PublicLoanCreateRequestSchema,
  ReturnLoanByQrRequestSchema,
  ReturnLoanRequestSchema,
} from '@tap/contracts';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TenantContext } from '../../../shared/index.ts';
import type { LoansService } from '../application/use-cases.ts';

export type AuthenticateRequestFn = (req: FastifyRequest) => Promise<TenantContext>;

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip.trim(), 'utf8').digest('hex').slice(0, 32);
}

export function createLoansRoutes(deps: {
  service: LoansService;
  authenticate: AuthenticateRequestFn;
}): FastifyPluginAsync {
  return async function loansRoutes(app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    // =========================================================================
    // Flujos públicos de préstamo (`/p/:code`, sin cuenta)
    // =========================================================================

    typed.get(
      '/public/lending-points/:code',
      {
        schema: {
          tags: ['loans'],
          summary:
            'Obtiene información del punto de préstamo, texto de autorización Ley 1581 y catálogo disponible',
          params: z.object({
            code: z.string().trim().min(4).max(32),
          }),
          response: {
            200: PublicLendingPointInfoSchema,
          },
        },
      },
      async (req) => {
        return deps.service.getPublicLendingPointInfo(req.params.code);
      },
    );

    typed.post(
      '/public/lending-points/:code/lookup',
      {
        schema: {
          tags: ['loans'],
          summary:
            'Consulta un prestatario devolviendo nombre abreviado («Juan P.»), documento enmascarado y elegibilidad (sin mora)',
          params: z.object({
            code: z.string().trim().min(4).max(32),
          }),
          body: PublicBorrowerLookupRequestSchema,
          response: {
            200: PublicBorrowerLookupResponseSchema,
          },
        },
      },
      async (req) => {
        return deps.service.lookupPublicBorrower(req.params.code, req.body);
      },
    );

    typed.post(
      '/public/lending-points/:code/loans',
      {
        schema: {
          tags: ['loans'],
          summary:
            'Registra un préstamo público exigiendo cabecera Idempotency-Key, autorización Ley 1581 y firma digital',
          params: z.object({
            code: z.string().trim().min(4).max(32),
          }),
          body: PublicLoanCreateRequestSchema,
          response: {
            201: LoanDtoSchema,
          },
        },
      },
      async (req, reply) => {
        const rawHeader = req.headers['idempotency-key'];
        const idempotencyKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
        const created = await deps.service.createPublicLoan({
          publicCode: req.params.code,
          idempotencyKey,
          input: req.body,
          ipHash: hashIp(req.ip),
        });
        return reply.status(201).send(created);
      },
    );

    // =========================================================================
    // Flujos privados de funcionario autenticado
    // =========================================================================

    typed.get(
      '/loans/lending-points',
      {
        schema: {
          tags: ['loans'],
          summary: 'Lista los puntos de préstamo de la entidad',
          response: {
            200: z.array(LendingPointDtoSchema),
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.listLendingPoints(actor);
      },
    );

    typed.post(
      '/loans/lending-points',
      {
        schema: {
          tags: ['loans'],
          summary: 'Crea un punto de préstamo con código público para cartel QR (/p/:code)',
          body: CreateLendingPointRequestSchema,
          response: {
            201: LendingPointDtoSchema,
          },
        },
      },
      async (req, reply) => {
        const actor = await deps.authenticate(req);
        const created = await deps.service.createLendingPoint(actor, req.body);
        return reply.status(201).send(created);
      },
    );

    typed.get(
      '/loans',
      {
        schema: {
          tags: ['loans'],
          summary: 'Lista los préstamos activos, vencidos y devueltos de la entidad',
          querystring: z.object({
            status: LoanStatusSchema.optional(),
          }),
          response: {
            200: z.array(LoanDtoSchema),
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.listLoans(actor, { status: req.query.status });
      },
    );

    typed.post(
      '/loans/:id/return',
      {
        schema: {
          tags: ['loans'],
          summary: 'Registra la devolución de un préstamo y libera la unidad en el inventario',
          params: z.object({ id: z.uuid() }),
          body: ReturnLoanRequestSchema,
          response: {
            200: LoanDtoSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.returnLoanById(actor, req.params.id, req.body);
      },
    );

    typed.post(
      '/loans/return-by-qr',
      {
        schema: {
          tags: ['loans'],
          summary: 'Devolución rápida escaneando el QR o código de la unidad física (ej: BAL-001)',
          body: ReturnLoanByQrRequestSchema,
          response: {
            200: LoanDtoSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.returnLoanByUnitQrOrCode(actor, req.body);
      },
    );

    typed.post(
      '/loans/sweep-overdue',
      {
        schema: {
          tags: ['loans'],
          summary:
            'Evalúa préstamos activos vencidos, los marca como overdue y encola recordatorios por correo',
          response: {
            200: OverdueSweepResponseSchema,
          },
        },
      },
      async (req) => {
        const actor = await deps.authenticate(req);
        return deps.service.sweepOverdueLoans(actor);
      },
    );

    typed.get(
      '/loans/:id/receipt-pdf',
      {
        schema: {
          tags: ['loans'],
          summary: 'Descarga el comprobante en PDF del préstamo con huella de firma digital',
          params: z.object({ id: z.uuid() }),
        },
      },
      async (req, reply) => {
        const actor = await deps.authenticate(req);
        const { code, pdfBuffer } = await deps.service.generateReceiptPdf(actor, req.params.id);
        return reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename="comprobante_prestamo_${code}.pdf"`)
          .send(pdfBuffer);
      },
    );
  };
}
