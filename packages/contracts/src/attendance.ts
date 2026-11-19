import { z } from 'zod';
import {
  EventSessionDtoSchema,
  EventStatusSchema,
  EventTypeSchema,
  IdentificationModeSchema,
} from './events.ts';
import { DocumentTypeSchema, PersonTypeSchema } from './people.ts';

export const AttendanceMethodSchema = z.enum(['event_qr', 'person_qr', 'manual']);
export type AttendanceMethod = z.infer<typeof AttendanceMethodSchema>;

export const AttendanceStatusSchema = z.enum(['valid', 'voided']);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export const PublicCheckinEventInfoSchema = z.object({
  event: z.object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    eventType: EventTypeSchema,
    status: EventStatusSchema,
    location: z.string().nullable(),
    startsAt: z.string(),
    endsAt: z.string(),
    checkinOpensAt: z.string(),
    checkinClosesAt: z.string(),
    publicCode: z.string(),
    allowedIdentificationModes: z.array(IdentificationModeSchema),
    confirmIdentity: z.boolean(),
    allowWalkIn: z.boolean(),
    activeSession: z.object({
      id: z.uuid(),
      sessionNumber: z.number().int().positive(),
      label: z.string(),
    }),
    sessions: z.array(EventSessionDtoSchema),
  }),
  organization: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    logoUrl: z.string().nullable(),
    dataConsentVersion: z.string(),
    dataConsentText: z.string(),
  }),
});
export type PublicCheckinEventInfo = z.infer<typeof PublicCheckinEventInfoSchema>;

export const PublicCheckinLookupRequestSchema = z.object({
  identificationMode: z.enum(['document', 'institutional_code']).default('document'),
  identifier: z.string().trim().min(3).max(64),
  documentType: DocumentTypeSchema.optional(),
});
export type PublicCheckinLookupRequest = z.infer<typeof PublicCheckinLookupRequestSchema>;

export const PublicCheckinLookupResponseSchema = z.object({
  found: z.boolean(),
  maskedName: z.string().nullable(),
  maskedDocument: z.string().nullable(),
  allowWalkIn: z.boolean(),
});
export type PublicCheckinLookupResponse = z.infer<typeof PublicCheckinLookupResponseSchema>;

export const WalkInRegistrationDataSchema = z.object({
  documentType: DocumentTypeSchema.default('CC'),
  documentNumber: z.string().trim().min(4).max(32),
  fullName: z.string().trim().min(3).max(160),
  institutionalCode: z.string().trim().max(40).nullable().optional(),
  email: z.email().trim().toLowerCase().nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  personType: PersonTypeSchema.default('student'),
  isMinor: z.boolean().default(false),
  guardianName: z.string().trim().max(160).nullable().optional(),
  guardianDocument: z.string().trim().max(32).nullable().optional(),
  guardianPhone: z.string().trim().max(32).nullable().optional(),
  acceptedDataConsent: z.literal(true),
  marketingOptIn: z.boolean().optional().default(false),
});
export type WalkInRegistrationData = z.infer<typeof WalkInRegistrationDataSchema>;

export const PublicCheckinSubmitRequestSchema = z.object({
  identificationMode: z.enum(['document', 'institutional_code']).default('document'),
  identifier: z.string().trim().min(3).max(64),
  documentType: DocumentTypeSchema.optional(),
  sessionId: z.uuid().optional(),
  clientDurationMs: z.number().int().min(0).max(600_000).optional(),
  walkInRegistration: WalkInRegistrationDataSchema.optional(),
});
export type PublicCheckinSubmitRequest = z.infer<typeof PublicCheckinSubmitRequestSchema>;

export const PublicCheckinOutcomeSchema = z.enum([
  'registered',
  'already_registered',
  'needs_registration',
]);
export type PublicCheckinOutcome = z.infer<typeof PublicCheckinOutcomeSchema>;

export const PublicCheckinSubmitResponseSchema = z.object({
  outcome: PublicCheckinOutcomeSchema,
  attendanceId: z.uuid().nullable(),
  checkedInAt: z.string().nullable(),
  maskedName: z.string().nullable(),
  maskedDocument: z.string().nullable(),
  sessionNumber: z.number().int().nullable(),
  sessionLabel: z.string().nullable(),
  message: z.string(),
});
export type PublicCheckinSubmitResponse = z.infer<typeof PublicCheckinSubmitResponseSchema>;

export const PublicPreregistrationRequestSchema = z.object({
  documentType: DocumentTypeSchema.default('CC'),
  documentNumber: z.string().trim().min(4, 'Escribe tu número de documento.').max(32),
  fullName: z.string().trim().min(3, 'Escribe tu nombre completo.').max(160),
  institutionalCode: z.string().trim().max(40).nullable().optional(),
  email: z
    .email('Ingresa un correo electrónico válido para enviarte la confirmación.')
    .trim()
    .toLowerCase(),
  phone: z.string().trim().max(32).nullable().optional(),
  personType: PersonTypeSchema.default('student'),
  isMinor: z.boolean().default(false),
  guardianName: z.string().trim().max(160).nullable().optional(),
  guardianDocument: z.string().trim().max(32).nullable().optional(),
  guardianPhone: z.string().trim().max(32).nullable().optional(),
  acceptedDataConsent: z.literal(true),
  marketingOptIn: z.boolean().optional().default(false),
});
export type PublicPreregistrationRequest = z.infer<typeof PublicPreregistrationRequestSchema>;

export const PublicPreregistrationResponseSchema = z.object({
  preregistered: z.boolean(),
  maskedName: z.string(),
  maskedEmail: z.string(),
  eventName: z.string(),
  message: z.string(),
});
export type PublicPreregistrationResponse = z.infer<typeof PublicPreregistrationResponseSchema>;

export const EventPreregistrationItemDtoSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  personId: z.uuid(),
  fullName: z.string(),
  documentType: DocumentTypeSchema,
  documentNumber: z.string(),
  institutionalCode: z.string().nullable(),
  email: z.string(),
  qrToken: z.string(),
  registeredAt: z.string(),
  checkedIn: z.boolean(),
  checkedInAt: z.string().nullable(),
});
export type EventPreregistrationItemDto = z.infer<typeof EventPreregistrationItemDtoSchema>;

export const EventPreregistrationListResponseSchema = z.object({
  eventId: z.uuid(),
  eventName: z.string(),
  publicCode: z.string(),
  totalPreregistered: z.number().int().min(0),
  totalCheckedIn: z.number().int().min(0),
  items: z.array(EventPreregistrationItemDtoSchema),
});
export type EventPreregistrationListResponse = z.infer<
  typeof EventPreregistrationListResponseSchema
>;

export const StaffScanAttendanceRequestSchema = z.object({
  qrToken: z.string().trim().min(6).max(64),
  sessionId: z.uuid().optional(),
  clientDurationMs: z.number().int().min(0).max(600_000).optional(),
});
export type StaffScanAttendanceRequest = z.infer<typeof StaffScanAttendanceRequestSchema>;

export const StaffManualAttendanceRequestSchema = z.object({
  identificationMode: z.enum(['document', 'institutional_code', 'manual']).default('document'),
  identifier: z.string().trim().min(3).max(64),
  documentType: DocumentTypeSchema.optional(),
  sessionId: z.uuid().optional(),
});
export type StaffManualAttendanceRequest = z.infer<typeof StaffManualAttendanceRequestSchema>;

export const VoidAttendanceRequestSchema = z.object({
  reason: z.string().trim().min(5).max(300),
});
export type VoidAttendanceRequest = z.infer<typeof VoidAttendanceRequestSchema>;

export const AttendanceRecordDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  eventId: z.uuid(),
  sessionId: z.uuid(),
  sessionNumber: z.number().int().positive(),
  sessionLabel: z.string(),
  personId: z.uuid(),
  personFullName: z.string(),
  personDocumentType: DocumentTypeSchema,
  personDocumentNumber: z.string(),
  personInstitutionalCode: z.string().nullable(),
  personType: PersonTypeSchema,
  checkedInAt: z.string(),
  method: AttendanceMethodSchema,
  registeredBy: z.uuid().nullable(),
  status: AttendanceStatusSchema,
  voidReason: z.string().nullable(),
  voidedAt: z.string().nullable(),
  voidedBy: z.uuid().nullable(),
  clientDurationMs: z.number().int().nullable(),
});
export type AttendanceRecordDto = z.infer<typeof AttendanceRecordDtoSchema>;

export const EventAttendanceSummaryDtoSchema = z.object({
  eventId: z.uuid(),
  totalValid: z.number().int().nonnegative(),
  totalVoided: z.number().int().nonnegative(),
  uniqueAttendees: z.number().int().nonnegative(),
  capacity: z.number().int().nullable(),
  remainingCapacity: z.number().int().nullable(),
  medianClientDurationMs: z.number().int().nullable(),
  byMethod: z.object({
    event_qr: z.number().int().nonnegative(),
    person_qr: z.number().int().nonnegative(),
    manual: z.number().int().nonnegative(),
  }),
  bySession: z.array(
    z.object({
      sessionId: z.uuid(),
      sessionNumber: z.number().int().positive(),
      label: z.string(),
      validCount: z.number().int().nonnegative(),
    }),
  ),
});
export type EventAttendanceSummaryDto = z.infer<typeof EventAttendanceSummaryDtoSchema>;

export const EventAttendanceListResponseSchema = z.object({
  summary: EventAttendanceSummaryDtoSchema,
  records: z.array(AttendanceRecordDtoSchema),
});
export type EventAttendanceListResponse = z.infer<typeof EventAttendanceListResponseSchema>;

export const AttendanceStreamEventSchema = z.object({
  type: z.enum(['snapshot', 'attendance.registered', 'attendance.voided']),
  eventId: z.uuid(),
  totalValid: z.number().int().nonnegative(),
  totalVoided: z.number().int().nonnegative(),
  latestRecord: AttendanceRecordDtoSchema.nullable(),
  occurredAt: z.string(),
});
export type AttendanceStreamEvent = z.infer<typeof AttendanceStreamEventSchema>;
