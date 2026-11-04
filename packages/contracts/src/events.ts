import { z } from 'zod';

export const EventTypeSchema = z.enum(['mass', 'course', 'recurring']);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EventStatusSchema = z.enum(['draft', 'scheduled', 'open', 'closed', 'cancelled']);
export type EventStatus = z.infer<typeof EventStatusSchema>;

export const IdentificationModeSchema = z.enum(['document', 'institutional_code', 'person_qr']);
export type IdentificationMode = z.infer<typeof IdentificationModeSchema>;

export const CertificateRuleTypeSchema = z.enum([
  'none',
  'any_attendance',
  'min_sessions',
  'min_attendance_percent',
]);
export type CertificateRuleType = z.infer<typeof CertificateRuleTypeSchema>;

export const CertificateRuleSchema = z.object({
  type: CertificateRuleTypeSchema.default('any_attendance'),
  minSessions: z.number().int().min(1).optional(),
  minPercent: z.number().min(1).max(100).optional(),
  hours: z.number().min(0.5).max(500).default(2),
});
export type CertificateRule = z.infer<typeof CertificateRuleSchema>;

export const EventSessionInputSchema = z.object({
  title: z.string().trim().min(2).max(140),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});
export type EventSessionInput = z.infer<typeof EventSessionInputSchema>;

export const EventSessionDtoSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  sessionNumber: z.number().int().positive(),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
});
export type EventSessionDto = z.infer<typeof EventSessionDtoSchema>;

export const EventDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  siteId: z.uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  type: EventTypeSchema,
  status: EventStatusSchema,
  publicCode: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  checkinOpensAt: z.string(),
  checkinClosesAt: z.string(),
  capacity: z.number().int().positive().nullable(),
  allowedIdentificationModes: z.array(IdentificationModeSchema),
  confirmIdentity: z.boolean(),
  allowWalkIn: z.boolean(),
  certificateRule: CertificateRuleSchema,
  autoIssueCertificates: z.boolean(),
  sessions: z.array(EventSessionDtoSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EventDto = z.infer<typeof EventDtoSchema>;

export const CreateEventRequestSchema = z.object({
  name: z.string().trim().min(3, 'Escribe el nombre del evento o actividad.').max(160),
  description: z.string().trim().max(600).nullable().optional(),
  type: EventTypeSchema.default('mass'),
  siteId: z.uuid().nullable().optional(),
  startsAt: z.string().datetime('Fecha/hora de inicio inválida.'),
  endsAt: z.string().datetime('Fecha/hora de finalización inválida.'),
  checkinOpensAt: z.string().datetime().optional(),
  checkinClosesAt: z.string().datetime().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  allowedIdentificationModes: z
    .array(IdentificationModeSchema)
    .min(1, 'Selecciona al menos un método de identificación.')
    .optional(),
  confirmIdentity: z.boolean().optional(),
  allowWalkIn: z.boolean().optional(),
  certificateRule: CertificateRuleSchema.optional(),
  autoIssueCertificates: z.boolean().optional(),
  sessions: z.array(EventSessionInputSchema).optional(),
});
export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;

export const UpdateEventRequestSchema = z.object({
  name: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(600).nullable().optional(),
  siteId: z.uuid().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  checkinOpensAt: z.string().datetime().optional(),
  checkinClosesAt: z.string().datetime().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  allowedIdentificationModes: z.array(IdentificationModeSchema).min(1).optional(),
  confirmIdentity: z.boolean().optional(),
  allowWalkIn: z.boolean().optional(),
  certificateRule: CertificateRuleSchema.optional(),
  autoIssueCertificates: z.boolean().optional(),
  sessions: z.array(EventSessionInputSchema).optional(),
});
export type UpdateEventRequest = z.infer<typeof UpdateEventRequestSchema>;

export const EventQrResponseSchema = z.object({
  eventId: z.uuid(),
  publicCode: z.string(),
  checkinUrl: z.string(),
  qrDataUrl: z.string(),
  qrSvg: z.string(),
});
export type EventQrResponse = z.infer<typeof EventQrResponseSchema>;
