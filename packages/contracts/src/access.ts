import { z } from 'zod';

/** Roles del personal definidos en AGENTS.md A7.1. */
export const StaffRoleSchema = z.enum(['platform_admin', 'org_admin', 'operator', 'viewer']);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

export const UserStatusSchema = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const LoginRequestSchema = z.object({
  email: z.email('Ingresa un correo electrónico válido.').transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, 'Escribe tu contraseña.'),
  organizationSlug: z.string().trim().min(1).optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserProfileSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid().nullable(),
  email: z.email(),
  fullName: z.string(),
  role: StaffRoleSchema,
  status: UserStatusSchema,
  createdAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const AuthTokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresInSeconds: z.number().int().positive(),
  user: UserProfileSchema,
});
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Escribe tu contraseña actual.'),
  newPassword: z
    .string()
    .min(12, 'La nueva contraseña debe tener al menos 12 caracteres.')
    .max(128, 'La contraseña no puede superar 128 caracteres.'),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const ManageableStaffRoleSchema = z.enum(['org_admin', 'operator', 'viewer']);
export type ManageableStaffRole = z.infer<typeof ManageableStaffRoleSchema>;

export const CreateUserRequestSchema = z.object({
  email: z.email('Ingresa un correo electrónico válido.').transform((v) => v.trim().toLowerCase()),
  fullName: z.string().trim().min(2, 'Escribe el nombre completo del funcionario.').max(120),
  password: z
    .string()
    .min(12, 'La contraseña debe tener al menos 12 caracteres.')
    .max(128, 'La contraseña no puede superar 128 caracteres.'),
  role: ManageableStaffRoleSchema,
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  role: ManageableStaffRoleSchema.optional(),
  status: UserStatusSchema.optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const GoogleAuthUrlResponseSchema = z.object({
  authorizationUrl: z.url(),
  state: z.string().optional(),
});
export type GoogleAuthUrlResponse = z.infer<typeof GoogleAuthUrlResponseSchema>;

/** Servicio adquirido por la entidad: únicamente asistencia rápida o inventarios, nunca ambos. */
export const ServiceModulePlanSchema = z.enum(['attendance_only', 'inventory_only']);
export type ServiceModulePlan = z.infer<typeof ServiceModulePlanSchema>;

export const RegisterOrganizationRequestSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, 'Escribe el nombre de la entidad u organización.')
    .max(140),
  organizationType: z.enum([
    'ente_deportivo',
    'caja',
    'gimnasio',
    'empresa',
    'institucion_educativa',
    'otro',
  ]),
  servicePlan: ServiceModulePlanSchema,
  adminFullName: z.string().trim().min(2, 'Escribe tu nombre completo.').max(120),
  adminEmail: z
    .email('Ingresa un correo institucional válido.')
    .transform((v) => v.trim().toLowerCase()),
  adminPassword: z
    .string()
    .min(12, 'La contraseña debe tener al menos 12 caracteres.')
    .max(128, 'La contraseña no puede superar 128 caracteres.'),
});
export type RegisterOrganizationRequest = z.infer<typeof RegisterOrganizationRequestSchema>;
