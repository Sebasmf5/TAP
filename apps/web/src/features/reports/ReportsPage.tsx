import type { DashboardSummaryResponse, ReportFormat, ReportType } from '@tap/contracts';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ApiClientError, apiDownloadFile, apiRequest } from '../../shared/api/http-client.ts';
import { Button, Card, StatCard } from '../../shared/ui/index.ts';

export function ReportsPage() {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>('attendance');
  const [includeFullDocument, setIncludeFullDocument] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await apiRequest<DashboardSummaryResponse>('/reports/dashboard');
        if (active) {
          setSummary(data);
        }
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof ApiClientError
              ? err.detail
              : 'No se pudieron cargar las estadísticas consolidadas.',
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleDownloadReport = async (format: ReportFormat) => {
    setErrorMessage(null);
    try {
      const qs = new URLSearchParams({
        type: reportType,
        format,
        includeFullDocument: includeFullDocument ? 'true' : 'false',
      });
      await apiDownloadFile(`/reports/export?${qs.toString()}`, `reporte_${reportType}.${format}`);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudo descargar el reporte.',
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-normal text-[var(--text-heading)]">
            Estadísticas y reportes descargables
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Métricas consolidadas desde las vistas de solo lectura (v_pub_*) y exportación auditada
            en CSV, Excel (.xlsx) y PDF.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-xs text-[var(--status-danger-text)]"
        >
          {errorMessage}
        </div>
      )}

      {loading || !summary ? (
        <Card title="Cargando métricas consolidadas…">
          <p className="text-sm text-[var(--text-muted)]">
            Consultando indicadores de eventos, certificados, inventario y préstamos…
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <StatCard
              label="Asistencias registradas"
              value={String(summary.kpis.totalCheckins)}
              hint={`${summary.kpis.totalEvents} evento(s) en total`}
            />
            <StatCard
              label="Certificados emitidos"
              value={String(summary.kpis.issuedCertificates)}
              hint="Verificables con QR en /v/:code"
            />
            <StatCard
              label="Unidades disponibles"
              value={`${summary.kpis.availableInventoryUnits} / ${summary.kpis.totalInventoryUnits}`}
              hint="Inventario físico activo"
            />
            <StatCard
              label="Préstamos vigentes / Mora"
              value={`${summary.kpis.activeLoans} / ${summary.kpis.overdueLoans}`}
              hint="Con firma digital registrada"
            />
          </div>

          <Card
            title="Centro de exportación de reportes (CSV, Excel y PDF)"
            description="Por defecto los números de documento se exportan enmascarados (•••1234) cumpliendo la Ley 1581 de 2012."
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-3 min-w-[260px]">
                <div>
                  <label
                    htmlFor="report-type-select"
                    className="mb-1.5 block text-xs font-medium text-[var(--text-body)]"
                  >
                    Módulo a exportar
                  </label>
                  <select
                    id="report-type-select"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as ReportType)}
                    className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-heading)]"
                    data-testid="report-type-select"
                  >
                    <option value="attendance">Asistencias por evento</option>
                    <option value="certificates">Certificados emitidos y verificaciones</option>
                    <option value="inventory">Inventario físico de unidades</option>
                    <option value="loans">Préstamos, devoluciones y mora</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs text-[var(--text-body)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeFullDocument}
                    onChange={(e) => setIncludeFullDocument(e.target.checked)}
                    data-testid="include-full-document-checkbox"
                  />
                  <span>
                    Incluir documento completo sin enmascarar (exclusivo org_admin, queda en
                    AuditLog)
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Única acción cromática principal por vista (AGENTS.md A9) */}
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void handleDownloadReport('xlsx')}
                  data-testid="export-xlsx-btn"
                >
                  <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                  Descargar Excel (.xlsx)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDownloadReport('csv')}
                  data-testid="export-csv-btn"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Descargar CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDownloadReport('pdf')}
                  data-testid="export-pdf-btn"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Descargar PDF
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card
              title="Asistencias y certificados por evento"
              description="Comparativo de participación registrada frente a certificados emitidos."
            >
              {summary.attendanceByEvent.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Aún no hay eventos registrados para graficar.
                </p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.attendanceByEvent}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="publicCode" stroke="var(--text-muted)" fontSize={11} />
                      <YAxis stroke="var(--text-muted)" fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="checkinsCount" name="Asistencias" fill="var(--action)" />
                      <Bar
                        dataKey="certificatesCount"
                        name="Certificados"
                        fill="var(--text-muted)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card
              title="Disponibilidad y demanda por modelo de implemento"
              description="Unidades disponibles frente a unidades actualmente en préstamo."
            >
              {summary.loansByModel.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No hay modelos de inventario registrados.
                </p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.loansByModel}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="modelName" stroke="var(--text-muted)" fontSize={11} />
                      <YAxis stroke="var(--text-muted)" fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="availableCount" name="Disponibles" fill="var(--action)" />
                      <Bar dataKey="loanedCount" name="En préstamo" fill="var(--text-muted)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
