import { z } from 'zod';

export const DocumentTypeSchema = z.enum(['CC', 'TI', 'CE', 'PAS', 'OTRO']);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const PersonTypeSchema = z.enum([
  'student',
  'teacher',
  'administrative',
  'external',
  'other',
]);
export type PersonType = z.infer<typeof PersonTypeSchema>;

export const ConsentChannelSchema = z.enum([
  'public_checkin',
  'public_loan',
  'staff_assisted',
  'import',
]);
export type ConsentChannel = z.infer<typeof ConsentChannelSchema>;

export const PersonDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  documentType: DocumentTypeSchema,
  documentNumber: z.string(),
  maskedDocument: z.string(),
  institutionalCode: z.string().nullable(),
  fullName: z.string(),
  abbreviatedName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  personType: PersonTypeSchema,
  isMinor: z.boolean(),
  guardianName: z.string().nullable(),
  guardianDocument: z.string().nullable(),
  guardianPhone: z.string().nullable(),
  qrToken: z.string(),
  latestConsentVersion: z.string().nullable(),
  latestConsentAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PersonDto = z.infer<typeof PersonDtoSchema>;

export const CreatePersonRequestSchema = z
  .object({
    documentType: DocumentTypeSchema.default('CC'),
    documentNumber: z
      .string()
      .trim()
      .min(4, 'El número de documento debe tener al menos 4 caracteres.')
      .max(32),
    institutionalCode: z.string().trim().max(40).nullable().optional(),
    fullName: z.string().trim().min(2, 'Escribe el nombre completo.').max(140),
    email: z.email('Correo electrónico inválido.').nullable().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    personType: PersonTypeSchema.default('student'),
    isMinor: z.boolean().default(false),
    guardianName: z.string().trim().max(140).nullable().optional(),
    guardianDocument: z.string().trim().max(32).nullable().optional(),
    guardianPhone: z.string().trim().max(32).nullable().optional(),
    consentAccepted: z.boolean().optional(),
    consentVersion: z.string().trim().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.isMinor && (!val.guardianName || !val.guardianPhone)) {
      ctx.addIssue({
        code: 'custom',
        path: ['guardianName'],
        message:
          'Los menores de edad requieren nombre y teléfono de contacto del acudiente (Ley 1581).',
      });
    }
  });
export type CreatePersonRequest = z.infer<typeof CreatePersonRequestSchema>;

export const UpdatePersonRequestSchema = z.object({
  institutionalCode: z.string().trim().max(40).nullable().optional(),
  fullName: z.string().trim().min(2).max(140).optional(),
  email: z.email('Correo electrónico inválido.').nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  personType: PersonTypeSchema.optional(),
  isMinor: z.boolean().optional(),
  guardianName: z.string().trim().max(140).nullable().optional(),
  guardianDocument: z.string().trim().max(32).nullable().optional(),
  guardianPhone: z.string().trim().max(32).nullable().optional(),
});
export type UpdatePersonRequest = z.infer<typeof UpdatePersonRequestSchema>;

export const ImportPeopleRequestSchema = z.object({
  csvContent: z.string().min(1, 'El contenido CSV no puede estar vacío.'),
  dryRun: z.boolean().default(true),
});
export type ImportPeopleRequest = z.infer<typeof ImportPeopleRequestSchema>;

export const ImportRowIssueSchema = z.object({
  rowNumber: z.number().int().positive(),
  field: z.string(),
  message: z.string(),
  rawLine: z.string(),
});
export type ImportRowIssue = z.infer<typeof ImportRowIssueSchema>;

export const ImportPreviewRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  action: z.enum(['create', 'update']),
  documentType: DocumentTypeSchema,
  documentNumber: z.string(),
  institutionalCode: z.string().nullable(),
  fullName: z.string(),
  email: z.string().nullable(),
  personType: PersonTypeSchema,
  isMinor: z.boolean(),
});
export type ImportPreviewRow = z.infer<typeof ImportPreviewRowSchema>;

export const ImportPeopleResponseSchema = z.object({
  dryRun: z.boolean(),
  totalRows: z.number().int().nonnegative(),
  validRowsCount: z.number().int().nonnegative(),
  createdCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  errors: z.array(ImportRowIssueSchema),
  preview: z.array(ImportPreviewRowSchema),
});
export type ImportPeopleResponse = z.infer<typeof ImportPeopleResponseSchema>;
