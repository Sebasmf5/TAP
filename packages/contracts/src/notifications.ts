import { z } from 'zod';

export const NotificationChannelTypeSchema = z.enum(['email', 'log']);
export type NotificationChannelType = z.infer<typeof NotificationChannelTypeSchema>;

export const NotificationTemplateKeySchema = z.enum([
  'certificate_issued',
  'loan_delivered',
  'loan_overdue',
  'loan_returned',
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
