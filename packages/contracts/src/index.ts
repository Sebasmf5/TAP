import { z } from 'zod';

/** Respuesta estándar RFC 9457 (application/problem+json). */
export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  code: z.string(),
  requestId: z.string().optional(),
  errors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

/** Esquema de respuesta de salud y disponibilidad (GET /health y GET /ready). */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('tap-api'),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ReadyResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.object({
    database: z.enum(['up', 'down']),
    jobQueue: z.enum(['up', 'down']),
  }),
  timestamp: z.string(),
});
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;

/** Paginación compartida para listados REST. */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export * from './access.ts';
export * from './attendance.ts';
export * from './events.ts';
export * from './organizations.ts';
export * from './people.ts';
