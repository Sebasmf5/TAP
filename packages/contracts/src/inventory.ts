import { z } from 'zod';

export const ItemTrackingTypeSchema = z.enum(['trackable', 'consumable']);
export type ItemTrackingType = z.infer<typeof ItemTrackingTypeSchema>;

export const UnitConditionSchema = z.enum(['new', 'good', 'fair', 'damaged']);
export type UnitCondition = z.infer<typeof UnitConditionSchema>;

export const UnitStatusSchema = z.enum([
  'available',
  'reserved',
  'loaned',
  'maintenance',
  'retired',
  'lost',
]);
export type UnitStatus = z.infer<typeof UnitStatusSchema>;

export const InventoryCategoryDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  defaultLoanDurationHours: z.number().int().min(1).max(720),
  maxUnitsPerBorrower: z.number().int().min(1).max(20),
  createdAt: z.string(),
});
export type InventoryCategoryDto = z.infer<typeof InventoryCategoryDtoSchema>;

export const CreateInventoryCategoryRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  defaultLoanDurationHours: z.number().int().min(1).max(720).default(4),
  maxUnitsPerBorrower: z.number().int().min(1).max(20).default(2),
});
export type CreateInventoryCategoryRequest = z.infer<typeof CreateInventoryCategoryRequestSchema>;

export const ItemModelDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  categoryId: z.uuid(),
  categoryName: z.string(),
  name: z.string(),
  codePrefix: z.string(),
  description: z.string().nullable(),
  trackingType: ItemTrackingTypeSchema,
  loanDurationHours: z.number().int(),
  availableUnitsCount: z.number().int(),
  loanedUnitsCount: z.number().int(),
  totalUnitsCount: z.number().int(),
  createdAt: z.string(),
});
export type ItemModelDto = z.infer<typeof ItemModelDtoSchema>;

export const CreateItemModelRequestSchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  codePrefix: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .transform((v) => v.toUpperCase()),
  description: z.string().trim().max(400).nullable().optional(),
  trackingType: ItemTrackingTypeSchema.default('trackable'),
  loanDurationHours: z.number().int().min(1).max(720).optional(),
});
export type CreateItemModelRequest = z.infer<typeof CreateItemModelRequestSchema>;

export const InventoryUnitDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  siteId: z.uuid(),
  modelId: z.uuid(),
  modelName: z.string(),
  categoryName: z.string(),
  code: z.string(),
  qrToken: z.string(),
  condition: UnitConditionSchema,
  status: UnitStatusSchema,
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type InventoryUnitDto = z.infer<typeof InventoryUnitDtoSchema>;

export const BulkCreateUnitsRequestSchema = z.object({
  siteId: z.uuid(),
  quantity: z.number().int().min(1).max(50),
  startNumber: z.number().int().min(1).max(9999).default(1),
  condition: UnitConditionSchema.default('good'),
});
export type BulkCreateUnitsRequest = z.infer<typeof BulkCreateUnitsRequestSchema>;

export const UpdateUnitStatusRequestSchema = z.object({
  status: UnitStatusSchema,
  condition: UnitConditionSchema.optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});
export type UpdateUnitStatusRequest = z.infer<typeof UpdateUnitStatusRequestSchema>;

export const GenerateUnitLabelsPdfRequestSchema = z.object({
  unitIds: z.array(z.uuid()).min(1).max(60).optional(),
  modelId: z.uuid().optional(),
});
export type GenerateUnitLabelsPdfRequest = z.infer<typeof GenerateUnitLabelsPdfRequestSchema>;
