import { z } from 'zod';

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

export const FeatureFlagsSchema = z.object({
  attendance: z.boolean().default(true),
  certificates: z.boolean().default(true),
  inventory: z.boolean().default(true),
  loans: z.boolean().default(true),
  reports: z.boolean().default(true),
  kioskMode: z.boolean().default(true),
  googleSso: z.boolean().default(false),
  marketing: z.boolean().default(false),
});
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
export type FeatureKey = keyof FeatureFlags;

export const OrganizationPlanSchema = z.enum(['pilot', 'standard', 'institutional']);
export type OrganizationPlan = z.infer<typeof OrganizationPlanSchema>;

export const OrganizationDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  type: OrganizationTypeSchema,
  plan: OrganizationPlanSchema,
  features: FeatureFlagsSchema,
  logoUrl: z.string().nullable(),
  timezone: z.string(),
  allowedEmailDomains: z.array(z.string()),
  dataConsentVersion: z.string(),
  dataConsentText: z.string(),
  retentionDays: z.number().int(),
  createdAt: z.string(),
});
export type OrganizationDto = z.infer<typeof OrganizationDtoSchema>;

const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'El identificador (slug) solo admite letras minúsculas, números y guiones.',
  )
  .min(2)
  .max(60);

export const CreateOrganizationRequestSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre de la entidad.').max(140),
  slug: SlugSchema,
  type: OrganizationTypeSchema,
  plan: OrganizationPlanSchema.default('pilot'),
  features: FeatureFlagsSchema.partial().optional(),
  allowedEmailDomains: z.array(z.string().trim().toLowerCase()).default([]),
  dataConsentVersion: z.string().trim().min(1).default('v1.0'),
  dataConsentText: z
    .string()
    .trim()
    .min(20)
    .default(
      'Autorizo de manera previa, expresa e informada el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 para el registro de asistencia, emisión de certificados y gestión de préstamos de implementos.',
    ),
  retentionDays: z.number().int().min(30).max(3650).default(365),
});
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>;

export const UpdateOrganizationRequestSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  type: OrganizationTypeSchema.optional(),
  plan: OrganizationPlanSchema.optional(),
  features: FeatureFlagsSchema.partial().optional(),
  logoUrl: z.string().trim().nullable().optional(),
  allowedEmailDomains: z.array(z.string().trim().toLowerCase()).optional(),
  dataConsentVersion: z.string().trim().min(1).optional(),
  dataConsentText: z.string().trim().min(20).optional(),
  retentionDays: z.number().int().min(30).max(3650).optional(),
});
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequestSchema>;

export const SiteDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  code: z.string(),
  address: z.string().nullable(),
  loanPointCode: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type SiteDto = z.infer<typeof SiteDtoSchema>;

export const CreateSiteRequestSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre de la sede o punto.').max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,24}$/, 'El código de sede debe tener entre 2 y 24 caracteres.'),
  address: z.string().trim().max(200).nullable().optional(),
});
export type CreateSiteRequest = z.infer<typeof CreateSiteRequestSchema>;

export const UpdateSiteRequestSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSiteRequest = z.infer<typeof UpdateSiteRequestSchema>;
