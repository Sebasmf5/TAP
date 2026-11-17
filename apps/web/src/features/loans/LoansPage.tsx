import type { LendingPointDto, LoanDto, OverdueSweepResponse, SiteDto } from '@tap/contracts';
import {
  AlertTriangle,
  Camera,
  Download,
  ExternalLink,
  Plus,
  QrCode,
  RotateCcw,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiClientError, apiDownloadFile, apiRequest } from '../../shared/api/http-client.ts';
import { Badge, Button, Card, Input, QrScannerModal, StatCard } from '../../shared/ui/index.ts';

export function LoansPage() {
  const [searchParams] = useSearchParams();
  const [loans, setLoans] = useState<LoanDto[]>([]);
  const [points, setPoints] = useState<LendingPointDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Devolución rápida por QR o código de unidad
  const [unitQrInput, setUnitQrInput] = useState(() => searchParams.get('returnQr') ?? '');
  const [returningQr, setReturningQr] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Nuevo punto de préstamo
  const [newPointName, setNewPointName] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [loanList, pointList, siteList] = await Promise.all([
          apiRequest<LoanDto[]>('/loans'),
          apiRequest<LendingPointDto[]>('/loans/lending-points'),
          apiRequest<SiteDto[]>('/sites'),
        ]);
        if (!active) return;
        setLoans(loanList);
        setPoints(pointList);
        if (siteList[0] && !selectedSiteId) {
          setSelectedSiteId(siteList[0].id);
        }
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof ApiClientError ? err.detail : 'No fue posible cargar los préstamos.',
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
  }, [reloadKey, selectedSiteId]);

  const handleReturnByQr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitQrInput.trim()) return;
    setReturningQr(true);
    setFeedback(null);
    setErrorMessage(null);
    try {
      const returned = await apiRequest<LoanDto>('/loans/return-by-qr', {
        method: 'POST',
        body: {
          unitQrOrCode: unitQrInput.trim(),
          conditionIn: 'good',
        },
      });
      setFeedback(
        `Devolución registrada: unidad ${returned.unitCode} (${returned.modelName}) devuelta por ${returned.borrowerName}.`,
      );
      setUnitQrInput('');
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudo procesar la devolución.',
      );
    } finally {
      setReturningQr(false);
    }
  };

  const handleReturnLoan = async (loan: LoanDto) => {
    setFeedback(null);
    setErrorMessage(null);
    try {
      const returned = await apiRequest<LoanDto>(`/loans/${loan.id}/return`, {
        method: 'POST',
        body: {
          conditionIn: 'good',
        },
      });
      setFeedback(`Unidad ${returned.unitCode} recibida y disponible nuevamente en inventario.`);
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudo devolver el préstamo.',
      );
    }
  };

  const handleSweepOverdue = async () => {
    setFeedback(null);
    setErrorMessage(null);
    try {
      const res = await apiRequest<OverdueSweepResponse>('/loans/sweep-overdue', {
        method: 'POST',
      });
      setFeedback(
        `Seguimiento de mora ejecutado: ${res.newlyMarkedOverdueCount} préstamo(s) marcados en mora y ${res.notificationsEnqueuedCount} recordatorio(s) enviados.`,
      );
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudo ejecutar el barrido de mora.',
      );
    }
  };

  const handleCreatePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPointName.trim() || !selectedSiteId) return;
    setErrorMessage(null);
    try {
      const created = await apiRequest<LendingPointDto>('/loans/lending-points', {
        method: 'POST',
        body: {
          siteId: selectedSiteId,
          name: newPointName.trim(),
          isOpen: true,
          requireOperatorApproval: false,
        },
      });
      setFeedback(`Punto de préstamo «${created.name}» creado con código /p/${created.publicCode}`);
      setNewPointName('');
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudo crear el punto de préstamo.',
      );
    }
  };

  const activeCount = loans.filter((l) => l.status === 'active').length;
  const overdueCount = loans.filter((l) => l.status === 'overdue').length;
  const returnedCount = loans.filter((l) => l.status === 'returned').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-normal text-[var(--text-heading)]">
            Préstamos y devoluciones de implementos
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Seguimiento en tiempo real, devolución rápida por QR de unidad y alertas automáticas de
            mora.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleSweepOverdue()}
          data-testid="sweep-overdue-btn"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Verificar préstamos vencidos
        </Button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-xs text-[var(--status-danger-text)]"
        >
          {errorMessage}
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className="rounded-[var(--radius-control)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-xs text-[var(--status-success-text)]"
          data-testid="loans-feedback-banner"
        >
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard
          label="Préstamos activos"
          value={String(activeCount)}
          hint="Implementos en poder de usuarios"
        />
        <StatCard
          label="Préstamos en mora"
          value={String(overdueCount)}
          hint="Bloquean nuevos préstamos"
        />
        <StatCard
          label="Devoluciones completadas"
          value={String(returnedCount)}
          hint="Unidades reintegradas"
        />
        <StatCard
          label="Puntos de préstamo"
          value={String(points.length)}
          hint="Con cartel QR público /p/:code"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Devolución rápida por código o QR de unidad"
          description="Escanea la etiqueta QR adherida al implemento con tu celular o escribe su código (ej: BAL-001) para liberarlo al instante."
        >
          <form
            onSubmit={(e) => void handleReturnByQr(e)}
            className="flex flex-col sm:flex-row gap-3 sm:items-end"
          >
            <div className="flex-1">
              <Input
                id="return-unit-qr-input"
                label="Código o token QR de la unidad"
                value={unitQrInput}
                onChange={(e) => setUnitQrInput(e.target.value)}
                placeholder="Ej: BAL-001 o UNIT-BAL001DEMO"
                data-testid="return-unit-qr-input"
                required
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setScannerOpen(true)}
                data-testid="open-loan-qr-scanner-btn"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                Escanear QR
              </Button>
              {/* Única acción cromática principal por vista (AGENTS.md A9) */}
              <Button
                type="submit"
                variant="primary"
                disabled={returningQr || !unitQrInput.trim()}
                data-testid="return-by-qr-btn"
              >
                <QrCode className="h-4 w-4" aria-hidden="true" />
                {returningQr ? 'Recibiendo…' : 'Registrar devolución'}
              </Button>
            </div>
          </form>
        </Card>

        <QrScannerModal
          open={scannerOpen}
          title="Escanear etiqueta QR del implemento"
          description="Apunta la cámara trasera del celular hacia la etiqueta QR de la unidad a devolver."
          onClose={() => setScannerOpen(false)}
          onDetected={(decoded) => {
            setUnitQrInput(decoded);
            setScannerOpen(false);
          }}
        />

        <Card
          title="Puntos de préstamo activos (/p/:code)"
          description="Comparte el enlace o cartel QR del punto para que los participantes soliciten implementos desde su celular."
        >
          <div className="space-y-3">
            {points.map((pt) => (
              <div
                key={pt.id}
                className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-xs"
              >
                <div>
                  <p className="font-medium text-[var(--text-heading)]">{pt.name}</p>
                  <p className="font-mono text-[var(--text-muted)]">Código: {pt.publicCode}</p>
                </div>
                <Link
                  to={`/p/${pt.publicCode}`}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-heading)] hover:bg-[var(--surface-hover)]"
                  data-testid={`open-lending-point-${pt.publicCode}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Abrir formulario /p/{pt.publicCode}
                </Link>
              </div>
            ))}

            <form
              onSubmit={(e) => void handleCreatePoint(e)}
              className="flex gap-2 items-end pt-2 border-t border-[var(--border)]"
            >
              <div className="flex-1">
                <Input
                  id="new-point-name"
                  label="Nuevo punto de préstamo"
                  value={newPointName}
                  onChange={(e) => setNewPointName(e.target.value)}
                  placeholder="Ej: Punto Gimnasio Universitario"
                />
              </div>
              <Button type="submit" variant="outline" size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Crear punto
              </Button>
            </form>
          </div>
        </Card>
      </div>

      <Card
        title={`Historial y préstamos vigentes (${loans.length})`}
        description="Cada préstamo conserva firma digital SHA-256, condición de entrega/devolución y estado de vencimiento."
      >
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Cargando préstamos…</p>
        ) : loans.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Aún no hay préstamos registrados en la entidad.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse" data-testid="loans-table">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                  <th className="py-2.5 pr-3 font-medium">Unidad</th>
                  <th className="py-2.5 px-3 font-medium">Implemento</th>
                  <th className="py-2.5 px-3 font-medium">Prestatario</th>
                  <th className="py-2.5 px-3 font-medium">Estado</th>
                  <th className="py-2.5 px-3 font-medium">Vencimiento</th>
                  <th className="py-2.5 pl-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loans.map((loan) => (
                  <tr
                    key={loan.id}
                    data-testid={`loan-row-${loan.unitCode}`}
                    className="hover:bg-[var(--surface-hover)]"
                  >
                    <td className="py-2.5 pr-3 font-mono font-semibold text-[var(--text-heading)]">
                      {loan.unitCode}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-heading)]">{loan.modelName}</td>
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-[var(--text-heading)]">{loan.borrowerName}</p>
                      <p className="font-mono text-[11px] text-[var(--text-muted)]">
                        {loan.maskedDocument}
                      </p>
                    </td>
                    <td className="py-2.5 px-3">
                      {loan.status === 'active' ? (
                        <Badge status="info">En préstamo</Badge>
                      ) : loan.status === 'overdue' ? (
                        <Badge status="danger">En mora</Badge>
                      ) : loan.status === 'returned' ? (
                        <Badge status="success">Devuelto</Badge>
                      ) : (
                        <Badge status="warning">{loan.status}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--text-body)]">
                      {new Intl.DateTimeFormat('es-CO', {
                        timeZone: 'America/Bogota',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(loan.dueAt))}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {(loan.status === 'active' || loan.status === 'overdue') && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleReturnLoan(loan)}
                            data-testid={`return-loan-btn-${loan.unitCode}`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            Recibir
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void apiDownloadFile(
                              `/loans/${loan.id}/receipt-pdf`,
                              `comprobante_${loan.unitCode}.pdf`,
                            )
                          }
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          Comprobante
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
