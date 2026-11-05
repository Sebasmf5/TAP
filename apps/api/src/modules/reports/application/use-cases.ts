import type {
  CertificateDto,
  DashboardSummaryResponse,
  EventDto,
  ExportReportQuery,
  InventoryUnitDto,
  ItemModelDto,
  LoanDto,
} from '@tap/contracts';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  ForbiddenError,
  formatBogotaDateTime,
  type AuditLog,
  type TenantContext,
} from '../../../shared/index.ts';
import type { AttendanceRecord } from '../../attendance/index.ts';
import type { Organization } from '../../organizations/index.ts';
import { maskDocumentNumber, type Person } from '../../people/index.ts';

type StaffActor = TenantContext;

function assertStaffOrganization(actor: StaffActor): string {
  if (!actor.organizationId) {
    throw new ForbiddenError('Esta operación requiere pertenecer a una entidad activa.');
  }
  return actor.organizationId;
}

export interface ReportTableData {
  title: string;
  subtitle: string;
  headers: string[];
  rows: string[][];
}

export class ReportsService {
  private readonly auditLog: AuditLog;
  private readonly findOrganizationById: (organizationId: string) => Promise<Organization | null>;
  private readonly assertFeatureEnabled: (
    organizationId: string,
    feature: 'reports',
  ) => Promise<void>;
  private readonly listEvents: (organizationId: string) => Promise<EventDto[]>;
  private readonly listValidAttendanceByEvent: (
    organizationId: string,
    eventId: string,
  ) => Promise<AttendanceRecord[]>;
  private readonly listCertificatesByEvent: (
    organizationId: string,
    eventId: string,
  ) => Promise<CertificateDto[]>;
  private readonly listInventoryModels: (organizationId: string) => Promise<ItemModelDto[]>;
  private readonly listInventoryUnits: (organizationId: string) => Promise<InventoryUnitDto[]>;
  private readonly listLoans: (organizationId: string) => Promise<LoanDto[]>;
  private readonly findPersonById: (
    organizationId: string,
    personId: string,
  ) => Promise<Person | null>;

  public constructor(deps: {
    auditLog: AuditLog;
    findOrganizationById: (organizationId: string) => Promise<Organization | null>;
    assertFeatureEnabled: (organizationId: string, feature: 'reports') => Promise<void>;
    listEvents: (organizationId: string) => Promise<EventDto[]>;
    listValidAttendanceByEvent: (
      organizationId: string,
      eventId: string,
    ) => Promise<AttendanceRecord[]>;
    listCertificatesByEvent: (organizationId: string, eventId: string) => Promise<CertificateDto[]>;
    listInventoryModels: (organizationId: string) => Promise<ItemModelDto[]>;
    listInventoryUnits: (organizationId: string) => Promise<InventoryUnitDto[]>;
    listLoans: (organizationId: string) => Promise<LoanDto[]>;
    findPersonById: (organizationId: string, personId: string) => Promise<Person | null>;
  }) {
    this.auditLog = deps.auditLog;
    this.findOrganizationById = deps.findOrganizationById;
    this.assertFeatureEnabled = deps.assertFeatureEnabled;
    this.listEvents = deps.listEvents;
    this.listValidAttendanceByEvent = deps.listValidAttendanceByEvent;
    this.listCertificatesByEvent = deps.listCertificatesByEvent;
    this.listInventoryModels = deps.listInventoryModels;
    this.listInventoryUnits = deps.listInventoryUnits;
    this.listLoans = deps.listLoans;
    this.findPersonById = deps.findPersonById;
  }

  public async getDashboardSummary(actor: StaffActor): Promise<DashboardSummaryResponse> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'reports');

    const [events, models, units, loans] = await Promise.all([
      this.listEvents(orgId),
      this.listInventoryModels(orgId),
      this.listInventoryUnits(orgId),
      this.listLoans(orgId),
    ]);

    const attendanceByEvent: DashboardSummaryResponse['attendanceByEvent'] = [];
    let totalCheckins = 0;
    let issuedCertificates = 0;

    for (const ev of events) {
      const [records, certs] = await Promise.all([
        this.listValidAttendanceByEvent(orgId, ev.id),
        this.listCertificatesByEvent(orgId, ev.id),
      ]);
      const activeCerts = certs.filter((c) => c.status === 'issued').length;
      totalCheckins += records.length;
      issuedCertificates += activeCerts;
      attendanceByEvent.push({
        eventId: ev.id,
        eventName: ev.name,
        publicCode: ev.publicCode,
        checkinsCount: records.length,
        certificatesCount: activeCerts,
      });
    }

    const loansByModel = models.map((m) => ({
      modelId: m.id,
      modelName: m.name,
      availableCount: m.availableUnitsCount,
      loanedCount: m.loanedUnitsCount,
      totalLoansHistoric: loans.filter((l) => l.modelId === m.id).length,
    }));

    const activeLoansCount = loans.filter(
      (l) => l.status === 'active' || l.status === 'pending_delivery',
    ).length;
    const overdueLoansCount = loans.filter((l) => l.status === 'overdue').length;
    const returnedLoansCount = loans.filter((l) => l.status === 'returned').length;

    return {
      kpis: {
        totalEvents: events.length,
        openEvents: events.filter((e) => e.status === 'open').length,
        totalCheckins,
        issuedCertificates,
        totalInventoryUnits: units.length,
        availableInventoryUnits: units.filter((u) => u.status === 'available').length,
        activeLoans: activeLoansCount,
        overdueLoans: overdueLoansCount,
      },
      attendanceByEvent,
      loansByModel,
      loanStatusBreakdown: [
        { status: 'active', label: 'Activos', count: activeLoansCount },
        { status: 'overdue', label: 'En mora', count: overdueLoansCount },
        { status: 'returned', label: 'Devueltos', count: returnedLoansCount },
      ],
    };
  }

  public async exportReport(
    actor: StaffActor,
    query: ExportReportQuery,
  ): Promise<{
    filename: string;
    contentType: string;
    buffer: Buffer;
  }> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'reports');

    const wantsFullDocument = Boolean(query.includeFullDocument);
    if (wantsFullDocument && actor.role !== 'org_admin') {
      throw new ForbiddenError(
        'Solo el administrador de la entidad (org_admin) puede exportar números de documento sin enmascarar.',
      );
    }

    if (wantsFullDocument) {
      await this.auditLog.record({
        organizationId: orgId,
        actorUserId: actor.userId,
        action: 'reports.personal_data_exported',
        targetType: 'report',
        targetId: query.type,
        metadata: {
          reportType: query.type,
          format: query.format,
          includeFullDocument: true,
        },
      });
    }

    const org = await this.findOrganizationById(orgId);
    const orgName = org?.name ?? 'Bienestar Institucional';

    const tableData = await this.buildReportTableData({
      organizationId: orgId,
      organizationName: orgName,
      query,
      includeFullDocument: wantsFullDocument,
    });

    if (query.format === 'csv') {
      const csvText = stringify([tableData.headers, ...tableData.rows], {
        bom: true,
      });
      return {
        filename: `reporte_${query.type}.csv`,
        contentType: 'text/csv; charset=utf-8',
        buffer: Buffer.from(csvText, 'utf8'),
      };
    }

    if (query.format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Tap';
      const sheet = workbook.addWorksheet(tableData.title.slice(0, 31));

      sheet.addRow([tableData.title]);
      sheet.addRow([tableData.subtitle]);
      sheet.addRow([]);
      const headerRow = sheet.addRow(tableData.headers);
      headerRow.font = { bold: true };

      for (const row of tableData.rows) {
        sheet.addRow(row);
      }

      const arrayBuf = await workbook.xlsx.writeBuffer();
      return {
        filename: `reporte_${query.type}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(arrayBuf),
      };
    }

    const pdfBuffer = await this.renderReportPdf(tableData, orgName);
    return {
      filename: `reporte_${query.type}.pdf`,
      contentType: 'application/pdf',
      buffer: pdfBuffer,
    };
  }

  private async buildReportTableData(params: {
    organizationId: string;
    organizationName: string;
    query: ExportReportQuery;
    includeFullDocument: boolean;
  }): Promise<ReportTableData> {
    const { organizationId, organizationName, query, includeFullDocument } = params;

    if (query.type === 'attendance') {
      const events = await this.listEvents(organizationId);
      const targetEvents = query.eventId ? events.filter((e) => e.id === query.eventId) : events;

      const rows: string[][] = [];
      for (const ev of targetEvents) {
        const records = await this.listValidAttendanceByEvent(organizationId, ev.id);
        for (const rec of records) {
          const person = await this.findPersonById(organizationId, rec.personId);
          const docDisplay = person
            ? includeFullDocument
              ? `${person.documentType} ${person.documentNumber}`
              : `${person.documentType} ${maskDocumentNumber(person.documentNumber)}`
            : '•••0000';
          rows.push([
            ev.name,
            person?.fullName ?? 'Participante',
            docDisplay,
            person?.personType ?? 'student',
            rec.method,
            formatBogotaDateTime(rec.checkedInAt),
          ]);
        }
      }

      return {
        title: 'Reporte de Asistencia a Eventos',
        subtitle: `${organizationName} — Total registros: ${rows.length}`,
        headers: [
          'Evento',
          'Participante',
          includeFullDocument ? 'Documento completo' : 'Documento (enmascarado)',
          'Estamento',
          'Canal de registro',
          'Fecha y hora (Bogotá)',
        ],
        rows,
      };
    }

    if (query.type === 'certificates') {
      const events = await this.listEvents(organizationId);
      const rows: string[][] = [];
      for (const ev of events) {
        const certs = await this.listCertificatesByEvent(organizationId, ev.id);
        for (const c of certs) {
          const person = await this.findPersonById(organizationId, c.personId);
          const docDisplay =
            includeFullDocument && person
              ? `${person.documentType} ${person.documentNumber}`
              : c.maskedDocument;
          rows.push([
            c.code,
            c.eventName,
            c.holderName,
            docDisplay,
            c.status,
            String(c.verificationCount),
            formatBogotaDateTime(new Date(c.issuedAt)),
          ]);
        }
      }

      return {
        title: 'Reporte de Certificados Emitidos',
        subtitle: `${organizationName} — Total certificados: ${rows.length}`,
        headers: [
          'Código',
          'Evento',
          'Titular',
          includeFullDocument ? 'Documento completo' : 'Documento (enmascarado)',
          'Estado',
          'Verificaciones',
          'Fecha de emisión',
        ],
        rows,
      };
    }

    if (query.type === 'inventory') {
      const units = await this.listInventoryUnits(organizationId);
      const rows = units.map((u) => [
        u.code,
        u.modelName,
        u.categoryName,
        u.status,
        u.condition,
        u.qrToken,
      ]);

      return {
        title: 'Reporte de Inventario Físico',
        subtitle: `${organizationName} — Total unidades: ${rows.length}`,
        headers: ['Código Unidad', 'Modelo', 'Categoría', 'Estado', 'Condición', 'Token QR'],
        rows,
      };
    }

    // loans
    const loans = await this.listLoans(organizationId);
    const rows: string[][] = [];
    for (const loan of loans) {
      const person = await this.findPersonById(organizationId, loan.personId);
      const docDisplay =
        includeFullDocument && person
          ? `${person.documentType} ${person.documentNumber}`
          : loan.maskedDocument;
      rows.push([
        loan.unitCode,
        loan.modelName,
        loan.borrowerName,
        docDisplay,
        loan.status,
        formatBogotaDateTime(new Date(loan.dueAt)),
        loan.returnedAt ? formatBogotaDateTime(new Date(loan.returnedAt)) : 'Pendiente',
      ]);
    }

    return {
      title: 'Reporte de Préstamos y Devoluciones',
      subtitle: `${organizationName} — Total préstamos: ${rows.length}`,
      headers: [
        'Unidad',
        'Implemento',
        'Prestatario',
        includeFullDocument ? 'Documento completo' : 'Documento (enmascarado)',
        'Estado',
        'Vencimiento',
        'Devolución',
      ],
      rows,
    };
  }

  private async renderReportPdf(table: ReportTableData, organizationName: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 32,
        info: {
          Title: table.title,
          Author: organizationName,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      doc
        .fillColor('#533afd')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(organizationName.toUpperCase());

      doc.moveDown(0.2).fillColor('#061b31').font('Helvetica-Bold').fontSize(16).text(table.title);

      doc.fillColor('#64748d').font('Helvetica').fontSize(9).text(table.subtitle);

      doc.moveDown(0.8);

      const colWidth = Math.floor((doc.page.width - 64) / Math.max(1, table.headers.length));
      let y = doc.y;

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#061b31');
      table.headers.forEach((h, idx) => {
        doc.text(h, 32 + idx * colWidth, y, { width: colWidth - 6 });
      });

      y += 18;
      doc
        .strokeColor('#cbd5e1')
        .lineWidth(0.8)
        .moveTo(32, y)
        .lineTo(doc.page.width - 32, y)
        .stroke();
      y += 6;

      doc.font('Helvetica').fontSize(8).fillColor('#273951');
      for (const row of table.rows) {
        if (y > doc.page.height - 48) {
          doc.addPage();
          y = 40;
        }
        row.forEach((cell, idx) => {
          doc.text(cell ?? '', 32 + idx * colWidth, y, {
            width: colWidth - 6,
            height: 14,
            ellipsis: true,
          });
        });
        y += 16;
      }

      doc.end();
    });
  }
}
