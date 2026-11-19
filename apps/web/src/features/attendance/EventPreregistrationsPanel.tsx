import type {
  AttendanceRecordDto,
  EventPreregistrationItemDto,
  EventPreregistrationListResponse,
} from '@tap/contracts';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { Badge, Button, Card, Input } from '../../shared/ui/index.ts';

export interface EventPreregistrationsPanelProps {
  readonly eventId: string;
  readonly eventName: string;
  readonly publicCode: string;
  readonly onAttendanceRecorded?: () => void;
}

function formatBogotaShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function EventPreregistrationsPanel({
  eventId,
  eventName,
  publicCode,
  onAttendanceRecorded,
}: EventPreregistrationsPanelProps) {
  const [data, setData] = useState<EventPreregistrationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [checkingInPersonId, setCheckingInPersonId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const preregUrl = useMemo(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/r/${encodeURIComponent(publicCode)}`;
  }, [publicCode]);

  const reloadPreregistrations = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await apiRequest<EventPreregistrationListResponse>(
          `/events/${eventId}/preregistrations`,
        );
        if (active) {
          setData(res);
          setErrorMessage(null);
        }
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof ApiClientError
              ? err.detail
              : 'No fue posible consultar los preregistros del evento.',
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
  }, [eventId, reloadKey]);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(preregUrl, { width: 220, margin: 1 }).then((url) => {
      if (active) setQrDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [preregUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(preregUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMessage('No se pudo copiar automáticamente; copia el enlace manualmente.');
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `preregistro_${publicCode.toLowerCase()}.png`;
    link.click();
  };

  const handleQuickCheckin = async (item: EventPreregistrationItemDto) => {
    setCheckingInPersonId(item.personId);
    setErrorMessage(null);
    setActionNotice(null);
    try {
      await apiRequest<AttendanceRecordDto>(`/events/${eventId}/attendance/scan`, {
        method: 'POST',
        body: { qrToken: item.qrToken },
      });
      setActionNotice(`Asistencia registrada para ${item.fullName}.`);
      reloadPreregistrations();
      onAttendanceRecorded?.();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError
          ? err.detail
          : `No se pudo registrar la asistencia de ${item.fullName}.`,
      );
    } finally {
      setCheckingInPersonId(null);
    }
  };

  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) =>
        item.fullName.toLowerCase().includes(term) ||
        item.documentNumber.toLowerCase().includes(term) ||
        item.email.toLowerCase().includes(term) ||
        item.qrToken.toLowerCase().includes(term),
    );
  }, [data?.items, search]);

  const totalPreregistered = data?.totalPreregistered ?? 0;
  const totalCheckedIn = data?.totalCheckedIn ?? 0;
  const totalPending = Math.max(0, totalPreregistered - totalCheckedIn);

  return (
    <Card
      title={`Panel de preregistro — ${eventName}`}
      description="Comparte el enlace o QR previo al evento y registra la asistencia en 1 clic cuando lleguen los preregistrados."
    >
      <div className="space-y-5">
        {/* Bloque de enlace y QR del formulario de preregistro */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-4">
          <div className="md:col-span-8 space-y-3">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Enlace del formulario de preregistro
              </p>
              <p className="mt-1 font-mono text-xs sm:text-sm text-[var(--text-heading)] break-all">
                {preregUrl}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleCopyLink()}
              >
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied ? 'Enlace copiado' : 'Copiar enlace'}
              </Button>
              <a
                href={`/r/${encodeURIComponent(publicCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-heading)] hover:bg-[var(--surface-hover)]"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Abrir formulario
              </a>
              {qrDataUrl && (
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadQr}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Descargar QR
                </Button>
              )}
            </div>
          </div>

          {qrDataUrl && (
            <div className="md:col-span-4 flex flex-col items-center justify-center">
              <img
                src={qrDataUrl}
                alt={`QR de preregistro para ${eventName}`}
                className="h-32 w-32 rounded-[var(--radius-control)] border border-[var(--border)] bg-white p-1.5"
              />
              <span className="mt-1.5 text-[11px] font-mono text-[var(--text-muted)]">
                /r/{publicCode}
              </span>
            </div>
          )}
        </div>

        {/* Resumen numérico conectado con asistencia */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
            <p className="text-xs text-[var(--text-muted)]">Preregistrados</p>
            <p className="mt-0.5 text-xl font-medium font-mono text-[var(--text-heading)]">
              {totalPreregistered}
            </p>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
            <p className="text-xs text-[var(--text-muted)]">Ya asistieron</p>
            <p className="mt-0.5 text-xl font-medium font-mono text-[var(--status-success-text)]">
              {totalCheckedIn}
            </p>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
            <p className="text-xs text-[var(--text-muted)]">Pendientes</p>
            <p className="mt-0.5 text-xl font-medium font-mono text-[var(--text-heading)]">
              {totalPending}
            </p>
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-xs text-[var(--status-danger-text)]"
          >
            {errorMessage}
          </div>
        )}

        {actionNotice && (
          <div
            role="status"
            className="rounded-[var(--radius-control)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3.5 py-2.5 text-xs text-[var(--status-success-text)] flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Buscador y actualización */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="relative flex-1">
            <Input
              label="Buscar preregistrado"
              placeholder="Nombre, documento, correo o código…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reloadPreregistrations}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </Button>
        </div>

        {/* Lista de preregistrados */}
        {loading && !data ? (
          <p className="text-xs text-[var(--text-muted)]">Cargando lista de preregistrados…</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-3">
            {totalPreregistered === 0
              ? 'Aún no hay personas preregistradas en este evento. Comparte el enlace superior para recibir preregistros.'
              : 'No hay coincidencias con tu búsqueda.'}
          </p>
        ) : (
          <div className="overflow-x-auto border border-[var(--border)] rounded-[var(--radius-control)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-raised)] text-[var(--text-muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Participante</th>
                  <th className="px-3 py-2 font-medium">Documento</th>
                  <th className="px-3 py-2 font-medium">Correo</th>
                  <th className="px-3 py-2 font-medium">Código QR</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium text-right">Asistencia rápida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--surface-hover)]/40">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[var(--text-heading)]">{item.fullName}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Preregistrado: {formatBogotaShort(item.registeredAt)}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[var(--text-body)]">
                      {item.documentType} {item.documentNumber}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-body)]">{item.email}</td>
                    <td className="px-3 py-2.5 font-mono text-[var(--text-heading)]">
                      {item.qrToken}
                    </td>
                    <td className="px-3 py-2.5">
                      {item.checkedIn ? (
                        <Badge status="success">
                          Asistió{' '}
                          {item.checkedInAt ? `(${formatBogotaShort(item.checkedInAt)})` : ''}
                        </Badge>
                      ) : (
                        <Badge status="neutral">Pendiente</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {item.checkedIn ? (
                        <span className="text-[11px] text-[var(--text-muted)]">Registrado</span>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={checkingInPersonId === item.personId}
                          onClick={() => void handleQuickCheckin(item)}
                        >
                          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          {checkingInPersonId === item.personId
                            ? 'Registrando…'
                            : 'Registrar asistencia'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
