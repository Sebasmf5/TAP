import { z } from 'zod';

export const ReportTypeSchema = z.enum(['attendance', 'certificates', 'inventory', 'loans']);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const ReportFormatSchema = z.enum(['csv', 'xlsx', 'pdf']);
export type ReportFormat = z.infer<typeof ReportFormatSchema>;

export const DashboardSummaryResponseSchema = z.object({
  kpis: z.object({
    totalEvents: z.number().int(),
    openEvents: z.number().int(),
    totalCheckins: z.number().int(),
    issuedCertificates: z.number().int(),
    totalInventoryUnits: z.number().int(),
    availableInventoryUnits: z.number().int(),
    activeLoans: z.number().int(),
    overdueLoans: z.number().int(),
  }),
  attendanceByEvent: z.array(
    z.object({
      eventId: z.uuid(),
      eventName: z.string(),
      publicCode: z.string(),
      checkinsCount: z.number().int(),
      certificatesCount: z.number().int(),
    }),
  ),
  loansByModel: z.array(
    z.object({
      modelId: z.uuid(),
      modelName: z.string(),
      availableCount: z.number().int(),
      loanedCount: z.number().int(),
      totalLoansHistoric: z.number().int(),
    }),
  ),
  loanStatusBreakdown: z.array(
    z.object({
      status: z.string(),
      label: z.string(),
      count: z.number().int(),
    }),
  ),
});
export type DashboardSummaryResponse = z.infer<typeof DashboardSummaryResponseSchema>;

export const ExportReportQuerySchema = z.object({
  type: ReportTypeSchema,
  format: ReportFormatSchema,
  eventId: z.uuid().optional(),
  includeFullDocument: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ExportReportQuery = z.infer<typeof ExportReportQuerySchema>;
