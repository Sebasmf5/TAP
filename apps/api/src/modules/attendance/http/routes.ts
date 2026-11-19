import {
  AttendanceRecordDtoSchema,
  AttendanceStatusSchema,
  EventAttendanceListResponseSchema,
  PublicCheckinEventInfoSchema,
  PublicCheckinLookupRequestSchema,
  PublicCheckinLookupResponseSchema,
  PublicCheckinSubmitRequestSchema,
  PublicCheckinSubmitResponseSchema,
  PublicPreregistrationRequestSchema,
  PublicPreregistrationResponseSchema,
  StaffManualAttendanceRequestSchema,
  StaffScanAttendanceRequestSchema,
  VoidAttendanceRequestSchema,
} from '@tap/contracts';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TenantContext } from '../../../shared/index.ts';
import type { AttendanceService } from '../application/use-cases.ts';

export type AuthenticateRequestFn = (req: FastifyRequest) => Promise<TenantContext>;

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip.trim(), 'utf8').digest('hex').slice(0, 32);
}

export function createAttendanceRoutes(deps: {
  service: AttendanceService;
  authenticate: AuthenticateRequestFn;
}): FastifyPluginAsync {
  return async function attendanceRoutes(app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    // =========================================================================
    // Flujos públicos de asistencia (sin cuenta, `AGENTS.md` A7.2 y B1.5)
    // =========================================================================

    typed.get(
      '/public/checkin/:code',
      {
        schema: {
          tags: ['attendance'],
          summary: 'Obtiene los datos mínimos del evento y de la entidad para el check-in público',
          params: z.object({
            code: z.string().trim().min(4).max(32),
          }),
          response: {
            200: PublicCheckinEventInfoSchema,
          },
        },
      },
      async (req) => {
        return deps.service.getPublicEventInfo(req.params.code, hashIp(req.ip));
      },
    );

    typed.post(
      '/public/checkin/:code/lookup',
      {
        schema: {
          tags: ['attendance'],
          summary:
            'Confirma identidad antes de registrar asistencia devolviendo solo nombre abreviado («Juan P.») y documento enmascarado',
          params: z.object({
            code: z.string().trim().min(4).max(32),
          }),
          body: PublicCheckinLookupRequestSchema,
          response: {
            200: PublicCheckinLookupResponseSchema,
          },
        },
      },
      async (req) => {
        return deps.service.lookupPublicParticipant({
          publicCode: req.params.code,
          input: req.body,
          ipHash: hashIp(req.ip),
        });
      },
    );

    typed.post(
      '/public/checkin/:code',
      {
        schema: {
          tags: ['attendance'],
          summary:
            'Registra asistencia de forma idempotente (INSERT ... ON CONFLICT DO NOTHING) sin efectos secundarios síncronos',
          params: z.object({
            code: z.string().trim().min(4).max(32),
          }),
          body: PublicCheckinSubmitRequestSchema,
          response: {
            200: PublicCheckinSubmitResponseSchema,
          },
        },
      },
      async (req) => {
        return deps.service.submitPublicCheckin({
          publicCode: req.params.code,
          input: req.body,
          ipHash: hashIp(req.ip),
          userAgent: req.headers['user-agent'] ?? null,
        });
      },
    );

    typed.post(
      '/public/preregister/:code',
      {
        schema: {
          tags: ['attendance'],
          summary:
            'Registra el preregistro público de un asistente y envía confirmación por correo con su código QR',
          params: z.object({
            code: z.string().trim().min(4).max(32),
          }),
          body: PublicPreregistrationRequestSchema,
          response: {
            200: PublicPreregistrationResponseSchema,
          },
        },
      },
      async (req) => {
        return deps.service.submitPublicPreregistration({
          publicCode: req.params.code,
          input: req.body,
          ipHash: hashIp(req.ip),
        });
      },
    );

    // =========================================================================
    // Flujos de funcionario autenticado con JWT (`docs/especificacion.md` B1.5)
    // =========================================================================

    typed.post(
      '/events/:id/attendance/scan',
      {
        schema: {
          tags: ['attendance'],
          summary: 'Modo quiosco: registra asistencia escaneando el QR del carné de la persona',
          params: z.object({ id: z.uuid() }),
          body: StaffScanAttendanceRequestSchema,
          response: {
            200: PublicCheckinSubmitResponseSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.scanPersonQrByStaff(ctx, req.params.id, req.body);
      },
    );

    typed.post(
      '/events/:id/attendance',
      {
        schema: {
          tags: ['attendance'],
          summary: 'Registra asistencia manualmente por parte de un funcionario',
          params: z.object({ id: z.uuid() }),
          body: StaffManualAttendanceRequestSchema,
          response: {
            200: PublicCheckinSubmitResponseSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.registerManualByStaff(ctx, req.params.id, req.body);
      },
    );

    typed.post(
      '/attendance/:id/void',
      {
        schema: {
          tags: ['attendance'],
          summary: 'Anula un registro de asistencia con motivo obligatorio (auditado)',
          params: z.object({ id: z.uuid() }),
          body: VoidAttendanceRequestSchema,
          response: {
            200: AttendanceRecordDtoSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.voidAttendance(ctx, req.params.id, req.body);
      },
    );

    typed.get(
      '/events/:id/attendance',
      {
        schema: {
          tags: ['attendance'],
          summary: 'Lista las asistencias y el resumen estadístico de un evento',
          params: z.object({ id: z.uuid() }),
          querystring: z.object({
            sessionId: z.uuid().optional(),
            status: AttendanceStatusSchema.optional(),
          }),
          response: {
            200: EventAttendanceListResponseSchema,
          },
        },
      },
      async (req) => {
        const ctx = await deps.authenticate(req);
        return deps.service.listEventAttendance(ctx, req.params.id, {
          sessionId: req.query.sessionId,
          status: req.query.status,
        });
      },
    );

    typed.get(
      '/events/:id/attendance/stream',
      {
        schema: {
          tags: ['attendance'],
          summary:
            'Flujo en vivo (SSE con Authorization: Bearer) con el contador y últimos check-ins del evento',
          params: z.object({ id: z.uuid() }),
        },
      },
      async (req, reply) => {
        const ctx = await deps.authenticate(req);
        const { initialSnapshot, unsubscribe } = await deps.service.subscribeToEventStream(
          ctx,
          req.params.id,
          (streamEvent) => {
            if (!reply.raw.writableEnded) {
              reply.raw.write(`data: ${JSON.stringify(streamEvent)}\n\n`);
            }
          },
        );

        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        reply.raw.write(`data: ${JSON.stringify(initialSnapshot)}\n\n`);

        const heartbeat = setInterval(() => {
          if (!reply.raw.writableEnded) {
            reply.raw.write(': keep-alive\n\n');
          }
        }, 15_000);

        req.raw.on('close', () => {
          clearInterval(heartbeat);
          unsubscribe();
        });

        return reply;
      },
    );
  };
}
