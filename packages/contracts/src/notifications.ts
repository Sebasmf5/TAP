import { z } from 'zod';

export const NotificationChannelTypeSchema = z.enum(['email', 'log']);
export type NotificationChannelType = z.infer<typeof NotificationChannelTypeSchema>;

export const NotificationTemplateKeySchema = z.enum([
  'certificate_issued',
  'loan_delivered',
  'loan_overdue',
  'loan_returned',
  'marketing_campaign',
]);
export type NotificationTemplateKey = z.infer<typeof NotificationTemplateKeySchema>;

export const NotificationStatusSchema = z.enum(['queued', 'sent', 'failed']);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

export const NotificationDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  channel: NotificationChannelTypeSchema,
  template: NotificationTemplateKeySchema,
  recipient: z.string(),
  subject: z.string(),
  status: NotificationStatusSchema,
  attempts: z.number().int().min(0),
  lastError: z.string().nullable(),
  relatedEntityType: z.string().nullable(),
  relatedEntityId: z.uuid().nullable(),
  deduplicationKey: z.string(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationDto = z.infer<typeof NotificationDtoSchema>;

export const ListNotificationsResponseSchema = z.object({
  totalCount: z.number().int().min(0),
  sentCount: z.number().int().min(0),
  queuedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  items: z.array(NotificationDtoSchema),
});
export type ListNotificationsResponse = z.infer<typeof ListNotificationsResponseSchema>;

export const MarketingCampaignRequestSchema = z.object({
  subject: z.string().trim().min(4, 'Escribe un asunto para la campaña.').max(160),
  message: z.string().trim().min(10, 'Escribe el mensaje promocional.').max(4000),
  ctaLabel: z.string().trim().max(60).optional(),
  ctaUrl: z.url('Ingresa una URL válida para el botón de acción.').optional(),
});
export type MarketingCampaignRequest = z.infer<typeof MarketingCampaignRequestSchema>;

export const MarketingCampaignResponseSchema = z.object({
  recipientsCount: z.number().int().min(0),
  skippedWithoutConsentCount: z.number().int().min(0),
  sentAt: z.string(),
});
export type MarketingCampaignResponse = z.infer<typeof MarketingCampaignResponseSchema>;
