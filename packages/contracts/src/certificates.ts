import { z } from 'zod';

export const CertificateOrientationSchema = z.enum(['landscape', 'portrait']);
export type CertificateOrientation = z.infer<typeof CertificateOrientationSchema>;

export const CertificateStatusSchema = z.enum(['issued', 'revoked']);
export type CertificateStatus = z.infer<typeof CertificateStatusSchema>;

export const CertificateSignerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  role: z.string().trim().min(2).max(120),
});
export type CertificateSigner = z.infer<typeof CertificateSignerSchema>;

export const CertificateTemplateDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  title: z.string(),
  bodyTemplate: z.string(),
  logoUrl: z.string().nullable(),
  signers: z.array(CertificateSignerSchema),
  orientation: CertificateOrientationSchema,
  version: z.number().int().min(1),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CertificateTemplateDto = z.infer<typeof CertificateTemplateDtoSchema>;

export const CreateCertificateTemplateRequestSchema = z.object({
  title: z.string().trim().min(3).max(160),
  bodyTemplate: z.string().trim().min(10).max(2000),
  logoUrl: z.string().trim().max(500).nullable().optional(),
  signers: z.array(CertificateSignerSchema).min(1).max(4),
  orientation: CertificateOrientationSchema.default('landscape'),
  isDefault: z.boolean().default(false),
});
export type CreateCertificateTemplateRequest = z.infer<
  typeof CreateCertificateTemplateRequestSchema
>;

export const UpdateCertificateTemplateRequestSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  bodyTemplate: z.string().trim().min(10).max(2000).optional(),
  logoUrl: z.string().trim().max(500).nullable().optional(),
  signers: z.array(CertificateSignerSchema).min(1).max(4).optional(),
  orientation: CertificateOrientationSchema.optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateCertificateTemplateRequest = z.infer<
  typeof UpdateCertificateTemplateRequestSchema
>;

export const PreviewCertificateTemplateRequestSchema = z.object({
  sampleFullName: z.string().trim().min(2).max(140).default('María Fernanda Gómez Ríos'),
  sampleEventName: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .default('Jornada Institucional de Bienestar Universitario'),
  sampleDate: z.string().trim().min(2).max(80).default('4 de noviembre de 2026'),
  sampleHours: z.string().trim().min(1).max(20).default('8'),
});
export type PreviewCertificateTemplateRequest = z.infer<
  typeof PreviewCertificateTemplateRequestSchema
>;

export const EligibilityEvaluationItemSchema = z.object({
  personId: z.uuid(),
  fullName: z.string(),
  maskedDocument: z.string(),
  email: z.string().nullable(),
  attendedSessions: z.number().int().min(0),
  totalSessions: z.number().int().min(1),
  attendancePercent: z.number().min(0).max(100),
  eligible: z.boolean(),
  reason: z.string(),
  alreadyIssued: z.boolean(),
  certificateId: z.uuid().nullable(),
  certificateCode: z.string().nullable(),
});
export type EligibilityEvaluationItem = z.infer<typeof EligibilityEvaluationItemSchema>;

export const EvaluateEventCertificatesResponseSchema = z.object({
  eventId: z.uuid(),
  eventName: z.string(),
  ruleSummary: z.string(),
  totalEvaluated: z.number().int().min(0),
  eligibleCount: z.number().int().min(0),
  ineligibleCount: z.number().int().min(0),
  alreadyIssuedCount: z.number().int().min(0),
  eligible: z.array(EligibilityEvaluationItemSchema),
  ineligible: z.array(EligibilityEvaluationItemSchema),
});
export type EvaluateEventCertificatesResponse = z.infer<
  typeof EvaluateEventCertificatesResponseSchema
>;

export const IssueEventCertificatesRequestSchema = z.object({
  templateId: z.uuid().optional(),
  hours: z.string().trim().min(1).max(20).default('4'),
  personIds: z.array(z.uuid()).optional(),
});
export type IssueEventCertificatesRequest = z.infer<typeof IssueEventCertificatesRequestSchema>;

export const CertificateDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  eventId: z.uuid(),
  personId: z.uuid(),
  templateId: z.uuid().nullable(),
  code: z.string(),
  status: CertificateStatusSchema,
  holderName: z.string(),
  maskedDocument: z.string(),
  recipientEmail: z.string().nullable(),
  eventName: z.string(),
  eventDate: z.string(),
  hours: z.string(),
  pdfSha256: z.string().nullable(),
  issuedAt: z.string(),
  deliveredAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedReason: z.string().nullable(),
  verificationCount: z.number().int().min(0),
});
export type CertificateDto = z.infer<typeof CertificateDtoSchema>;

export const IssueEventCertificatesResponseSchema = z.object({
  eventId: z.uuid(),
  issuedCount: z.number().int().min(0),
  skippedAlreadyIssuedCount: z.number().int().min(0),
  ineligibleCount: z.number().int().min(0),
  certificates: z.array(CertificateDtoSchema),
});
export type IssueEventCertificatesResponse = z.infer<typeof IssueEventCertificatesResponseSchema>;

export const RevokeCertificateRequestSchema = z.object({
  reason: z.string().trim().min(5).max(400),
});
export type RevokeCertificateRequest = z.infer<typeof RevokeCertificateRequestSchema>;

export const PublicCertificateVerificationResponseSchema = z.object({
  found: z.boolean(),
  status: z.enum(['valid', 'revoked', 'not_found']),
  code: z.string(),
  holderName: z.string().nullable(),
  eventName: z.string().nullable(),
  eventDate: z.string().nullable(),
  hours: z.string().nullable(),
  organizationName: z.string().nullable(),
  issuedAt: z.string().nullable(),
  pdfSha256: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedReason: z.string().nullable(),
});
export type PublicCertificateVerificationResponse = z.infer<
  typeof PublicCertificateVerificationResponseSchema
>;
