import { z } from 'zod';

/** Roles del personal definidos en AGENTS.md A7.1. */
export const StaffRoleSchema = z.enum(['platform_admin', 'org_admin', 'operator', 'viewer']);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

/** Tipos de entidad definidos en docs/especificacion.md B1.2. */
export const OrganizationTypeSchema = z.enum([
  'ente_deportivo',
  'caja',
  'gimnasio',
  'empresa',
  'institucion_educativa',
  'otro',
]);
export type OrganizationType = z.infer<typeof OrganizationTypeSchema>;

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
