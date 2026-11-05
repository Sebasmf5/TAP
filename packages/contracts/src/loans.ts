import { z } from 'zod';
import { DocumentTypeSchema, PersonTypeSchema } from './people.ts';
import { UnitConditionSchema } from './inventory.ts';

export const LoanStatusSchema = z.enum([
  'pending_delivery',
  'active',
  'returned',
  'overdue',
  'cancelled',
]);
export type LoanStatus = z.infer<typeof LoanStatusSchema>;

export const LendingPointDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  siteId: z.uuid(),
  name: z.string(),
  publicCode: z.string(),
  isOpen: z.boolean(),
  requireOperatorApproval: z.boolean(),
  createdAt: z.string(),
});
export type LendingPointDto = z.infer<typeof LendingPointDtoSchema>;

export const CreateLendingPointRequestSchema = z.object({
  siteId: z.uuid(),
  name: z.string().trim().min(3).max(120),
  isOpen: z.boolean().default(true),
  requireOperatorApproval: z.boolean().default(false),
});
export type CreateLendingPointRequest = z.infer<typeof CreateLendingPointRequestSchema>;

export const PublicLendingPointCatalogModelSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  categoryName: z.string(),
  codePrefix: z.string(),
  loanDurationHours: z.number().int(),
  availableCount: z.number().int(),
});
export type PublicLendingPointCatalogModel = z.infer<typeof PublicLendingPointCatalogModelSchema>;

export const PublicLendingPointInfoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  publicCode: z.string(),
  isOpen: z.boolean(),
  organization: z.object({
    name: z.string(),
    dataConsentVersion: z.string(),
    dataConsentText: z.string(),
  }),
  availableModels: z.array(PublicLendingPointCatalogModelSchema),
});
export type PublicLendingPointInfo = z.infer<typeof PublicLendingPointInfoSchema>;

export const PublicBorrowerLookupRequestSchema = z.object({
  identificationMode: z.enum(['document', 'institutional_code']).default('document'),
  identifier: z.string().trim().min(3).max(64),
  documentType: DocumentTypeSchema.optional(),
});
export type PublicBorrowerLookupRequest = z.infer<typeof PublicBorrowerLookupRequestSchema>;

export const PublicBorrowerLookupResponseSchema = z.object({
  found: z.boolean(),
  maskedName: z.string().nullable(),
  maskedDocument: z.string().nullable(),
  eligible: z.boolean(),
  ineligibilityReason: z.string().nullable(),
});
export type PublicBorrowerLookupResponse = z.infer<typeof PublicBorrowerLookupResponseSchema>;

export const PublicLoanCreateRequestSchema = z.object({
  identificationMode: z.enum(['document', 'institutional_code']).default('document'),
  identifier: z.string().trim().min(3).max(64),
  documentType: DocumentTypeSchema.optional(),
  modelId: z.uuid(),
  acceptedDataConsent: z.literal(true),
  signatureDataUrl: z.string().trim().min(20).max(250_000),
  walkInRegistration: z
    .object({
      documentType: DocumentTypeSchema.default('CC'),
      documentNumber: z.string().trim().min(4).max(32),
      fullName: z.string().trim().min(3).max(160),
      institutionalCode: z.string().trim().max(40).nullable().optional(),
      email: z.email().trim().toLowerCase().nullable().optional(),
      phone: z.string().trim().max(32).nullable().optional(),
      personType: PersonTypeSchema.default('student'),
      isMinor: z.boolean().default(false),
    })
    .optional(),
});
export type PublicLoanCreateRequest = z.infer<typeof PublicLoanCreateRequestSchema>;

export const LoanDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  siteId: z.uuid(),
  lendingPointId: z.uuid().nullable(),
  lendingPointName: z.string(),
  personId: z.uuid(),
  borrowerName: z.string(),
  maskedDocument: z.string(),
  borrowerEmail: z.string().nullable(),
  unitId: z.uuid(),
  unitCode: z.string(),
  unitQrToken: z.string(),
  modelId: z.uuid(),
  modelName: z.string(),
  status: LoanStatusSchema,
  conditionOut: UnitConditionSchema,
  conditionIn: UnitConditionSchema.nullable(),
  signatureSha256: z.string(),
  dueAt: z.string(),
  deliveredAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  returnNotes: z.string().nullable(),
  createdAt: z.string(),
});
export type LoanDto = z.infer<typeof LoanDtoSchema>;

export const ReturnLoanRequestSchema = z.object({
  conditionIn: UnitConditionSchema.default('good'),
  notes: z.string().trim().max(300).nullable().optional(),
});
export type ReturnLoanRequest = z.infer<typeof ReturnLoanRequestSchema>;

export const ReturnLoanByQrRequestSchema = z.object({
  unitQrOrCode: z.string().trim().min(2).max(120),
  conditionIn: UnitConditionSchema.default('good'),
  notes: z.string().trim().max(300).nullable().optional(),
});
export type ReturnLoanByQrRequest = z.infer<typeof ReturnLoanByQrRequestSchema>;

export const OverdueSweepResponseSchema = z.object({
  evaluatedCount: z.number().int(),
  newlyMarkedOverdueCount: z.number().int(),
  notificationsEnqueuedCount: z.number().int(),
});
export type OverdueSweepResponse = z.infer<typeof OverdueSweepResponseSchema>;
