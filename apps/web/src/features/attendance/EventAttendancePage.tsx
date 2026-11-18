import type {
  AttendanceRecordDto,
  AttendanceStreamEvent,
  EventAttendanceListResponse,
  EventDto,
  PublicCheckinSubmitResponse,
} from '@tap/contracts';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  CloudOff,
  ImageUp,
  QrCode,
  Radio,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  Wifi,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ApiClientError,
  apiRequest,
  subscribeServerSentEvents,
} from '../../shared/api/http-client.ts';
import { useAuth } from '../../shared/auth/auth-context.tsx';
import {
  isLikelyNetworkError,
  maskIdentifierForQueue,
} from '../../shared/offline/attendance-queue.ts';
import { useOfflineAttendance } from '../../shared/offline/use-offline-attendance.ts';
import { Badge, Button, Card, StatCard } from '../../shared/ui/index.ts';

function decodeQrFromCanvasSource(
  source: CanvasImageSource,
  width: number,
  height: number,
): string | null {
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const result = jsQR(imageData.data, width, height, {
    inversionAttempts: 'attemptBoth',
  });
  return result?.data?.trim() || null;
}

const METHOD_LABELS: Record<string, string> = {
  event_qr: 'QR Evento',
  person_qr: 'QR Carné (Quiosco)',
  manual: 'Manual',
};

function formatBogotaTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function EventAttendancePage() {
  const { id: eventId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canWrite = user?.role === 'org_admin' || user?.role === 'operator';

  const [event, setEvent] = useState<EventDto | null>(null);
  const [attendanceData, setAttendanceData] = useState<EventAttendanceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);

  // Filtros
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'voided'>('all');

  // Modo quiosco vs. manual
  const [entryTab, setEntryTab] = useState<'kiosk' | 'manual'>('kiosk');
  const [kioskQrToken, setKioskQrToken] = useState('');
  const [manualMode, setManualMode] = useState<'document' | 'institutional_code'>('document');
  const [manualIdentifier, setManualIdentifier] = useState('');
  const [entryFeedback, setEntryFeedback] = useState<{
    outcome: 'registered' | 'already_registered' | 'error';
    message: string;
    maskedName?: string | null;
  } | null>(null);
  const [submittingEntry, setSubmittingEntry] = useState(false);

  // Modal de anulación auditada
  const [voidTarget, setVoidTarget] = useState<AttendanceRecordDto | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [submittingVoid, setSubmittingVoid] = useState(false);

  // Estado de recarga para sincronización y SSE
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  const {
    isOnline,
    pendingCount,
    syncing: syncingOffline,
    lastSyncSummary,
    queueAttendance,
    syncNow,
  } = useOfflineAttendance({
    onSynced: () => {
      reload();
    },
  });

  useEffect(() => {
    if (!eventId) return;
    let active = true;

    void (async () => {
      try {
        const query = new URLSearchParams();
        if (selectedSessionId) query.set('sessionId', selectedSessionId);
        if (statusFilter !== 'all') query.set('status', statusFilter);
        const qs = query.toString();

        const [ev, att] = await Promise.all([
          apiRequest<EventDto>(`/events/${eventId}`),
          apiRequest<EventAttendanceListResponse>(
            `/events/${eventId}/attendance${qs ? `?${qs}` : ''}`,
          ),
        ]);
        if (active) {
          setEvent(ev);
          setAttendanceData(att);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiClientError
              ? err.detail
              : 'No fue posible cargar la asistencia del evento.',
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
  }, [eventId, selectedSessionId, statusFilter, reloadKey]);

  // Suscripción en tiempo real mediante fetch streaming con Authorization: Bearer (AGENTS.md A7.1)
  useEffect(() => {
    if (!eventId) return;
    const unsubscribe = subscribeServerSentEvents<AttendanceStreamEvent>({
      path: `/events/${eventId}/attendance/stream`,
      onMessage: (streamEvent) => {
        setStreamConnected(true);
        if (
          streamEvent.type === 'attendance.registered' ||
          streamEvent.type === 'attendance.voided'
        ) {
          reload();
        }
      },
      onError: () => {
        setStreamConnected(false);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [eventId, reload]);

  const submitKioskToken = useCallback(
    async (rawToken: string) => {
      const cleanToken = rawToken.trim();
      if (!eventId || cleanToken.length < 6) return;
      setSubmittingEntry(true);
      setEntryFeedback(null);

      const endpoint = `/events/${eventId}/attendance/scan`;
      const payload = {
        qrToken: cleanToken,
        sessionId: selectedSessionId || undefined,
      };

      if (!isOnline) {
        await queueAttendance({
          kind: 'kiosk_scan',
          endpoint,
          payload,
          maskedLabel: `Carné QR ${maskIdentifierForQueue(cleanToken)}`,
        });
        setKioskQrToken('');
        setEntryFeedback({
          outcome: 'registered',
          message:
            'Sin conexión Wi-Fi: asistencia guardada en cola local. Se enviará automáticamente al reconectar.',
        });
        setSubmittingEntry(false);
        return;
      }

      try {
        const res = await apiRequest<PublicCheckinSubmitResponse>(endpoint, {
          method: 'POST',
          body: payload,
        });
        setKioskQrToken('');
        setEntryFeedback({
          outcome: res.outcome === 'already_registered' ? 'already_registered' : 'registered',
          message: res.message,
          maskedName: res.maskedName,
        });
        reload();
      } catch (err) {
        if (isLikelyNetworkError(err)) {
          await queueAttendance({
            kind: 'kiosk_scan',
            endpoint,
            payload,
            maskedLabel: `Carné QR ${maskIdentifierForQueue(cleanToken)}`,
          });
          setKioskQrToken('');
          setEntryFeedback({
            outcome: 'registered',
            message:
              'Conexión perdida: asistencia guardada en cola local para sincronizarse al volver el internet.',
          });
        } else {
          setEntryFeedback({
            outcome: 'error',
            message:
              err instanceof ApiClientError
                ? err.detail
                : 'No se pudo procesar el código QR del carné.',
          });
        }
      } finally {
        setSubmittingEntry(false);
      }
    },
    [eventId, isOnline, queueAttendance, reload, selectedSessionId],
  );

  // Escáner QR con cámara web en vivo y desde imagen
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastScannedRef = useRef<{ token: string; at: number }>({ token: '', at: 0 });

  useEffect(() => {
    if (!cameraActive || entryTab !== 'kiosk') return;
    let cancelled = false;
    let mediaStream: MediaStream | null = null;
    let scanTimer: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
        }

        scanTimer = setInterval(() => {
          const videoEl = videoRef.current;
          if (!videoEl || videoEl.readyState < 2) return;
          const detected = decodeQrFromCanvasSource(
            videoEl,
            videoEl.videoWidth || 640,
            videoEl.videoHeight || 480,
          );
          if (!detected || detected.length < 6) return;
          const now = Date.now();
          if (lastScannedRef.current.token === detected && now - lastScannedRef.current.at < 3000) {
            return;
          }
          lastScannedRef.current = { token: detected, at: now };
          setKioskQrToken(detected);
          void submitKioskToken(detected);
        }, 250);
      } catch {
        if (!cancelled) {
          setCameraActive(false);
          setEntryFeedback({
            outcome: 'error',
            message:
              'No fue posible acceder a la cámara del navegador. Verifica los permisos o usa «Escanear imagen QR».',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (scanTimer) clearInterval(scanTimer);
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraActive, entryTab, submitKioskToken]);

  const handleScanImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const detected = decodeQrFromCanvasSource(bitmap, bitmap.width, bitmap.height);
      if (!detected) {
        setEntryFeedback({
          outcome: 'error',
          message: 'No se detectó ningún código QR válido en la imagen seleccionada.',
        });
        return;
      }
      setKioskQrToken(detected);
      await submitKioskToken(detected);
    } catch {
      setEntryFeedback({
        outcome: 'error',
        message: 'No se pudo leer la imagen del código QR.',
      });
    }
  };

  const handleKioskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitKioskToken(kioskQrToken);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !manualIdentifier.trim()) return;
    setSubmittingEntry(true);
    setEntryFeedback(null);

    const endpoint = `/events/${eventId}/attendance`;
    const payload = {
      identificationMode: manualMode,
      identifier: manualIdentifier.trim(),
      sessionId: selectedSessionId || undefined,
    };

    if (!isOnline) {
      await queueAttendance({
        kind: 'staff_manual',
        endpoint,
        payload,
        maskedLabel: `Manual ${maskIdentifierForQueue(manualIdentifier)}`,
      });
      setManualIdentifier('');
      setEntryFeedback({
        outcome: 'registered',
        message:
          'Sin conexión Wi-Fi: registro manual guardado en cola local. Se enviará al reconectar.',
      });
      setSubmittingEntry(false);
      return;
    }

    try {
      const res = await apiRequest<PublicCheckinSubmitResponse>(endpoint, {
        method: 'POST',
        body: payload,
      });
      setManualIdentifier('');
      setEntryFeedback({
        outcome: res.outcome === 'already_registered' ? 'already_registered' : 'registered',
        message: res.message,
        maskedName: res.maskedName,
      });
      reload();
    } catch (err) {
      if (isLikelyNetworkError(err)) {
        await queueAttendance({
          kind: 'staff_manual',
          endpoint,
          payload,
          maskedLabel: `Manual ${maskIdentifierForQueue(manualIdentifier)}`,
        });
        setManualIdentifier('');
        setEntryFeedback({
          outcome: 'registered',
          message:
            'Conexión perdida: registro manual guardado en cola local para sincronizarse al volver el internet.',
        });
      } else {
        setEntryFeedback({
          outcome: 'error',
          message:
            err instanceof ApiClientError
              ? err.detail
              : 'No se encontró al participante con ese identificador.',
        });
      }
    } finally {
      setSubmittingEntry(false);
    }
  };

  const handleVoidAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget || voidReason.trim().length < 5) return;
    setSubmittingVoid(true);
    try {
      await apiRequest(`/attendance/${voidTarget.id}/void`, {
        method: 'POST',
        body: { reason: voidReason.trim() },
      });
      setVoidTarget(null);
      setVoidReason('');
      reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.detail : 'No fue posible anular la asistencia.');
    } finally {
      setSubmittingVoid(false);
    }
  };

  if (loading && !attendanceData) {
    return (
      <div className="py-12">
        <p className="text-sm text-[var(--text-muted)]">Cargando consola de asistencia en vivo…</p>
      </div>
    );
  }

  const summary = attendanceData?.summary;

  return (
    <div className="space-y-8">
      {/* Encabezado con enlace a la página pública */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Link to="/app/events" className="hover:underline">
              ← Volver a Eventos
            </Link>
            <span>•</span>
            <span className="inline-flex items-center gap-1 font-mono">
              <Radio
                className={`h-3.5 w-3.5 ${
                  streamConnected ? 'text-[var(--status-success-text)]' : 'text-[var(--text-muted)]'
                }`}
                aria-hidden="true"
              />
              {streamConnected ? 'Flujo SSE en vivo conectado' : 'Sincronizado'}
            </span>
          </div>
          <h1
            className="mt-1 text-2xl font-light text-[var(--text-heading)] tracking-tight"
            data-testid="event-attendance-heading"
          >
            {event ? event.name : 'Asistencia del evento'}
          </h1>
          {event && (
            <p className="mt-1 text-sm text-[var(--text-body)]">
              Código público:{' '}
              <Link
                to={`/c/${event.publicCode}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono font-medium text-[var(--link)] hover:underline"
              >
                /c/{event.publicCode}
              </Link>{' '}
              — Estado actual:{' '}
              <span className="font-medium uppercase font-mono text-xs">{event.status}</span>
            </p>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-[var(--status-danger-text)]"
        >
          {error}
        </div>
      )}

      {/* Indicadores en vivo con cifras tabulares */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Asistencias válidas"
            value={String(summary.totalValid)}
            deltaLabel={
              summary.capacity !== null
                ? `Aforo: ${summary.totalValid} / ${summary.capacity} (${summary.remainingCapacity} disp.)`
                : `${summary.uniqueAttendees} participantes únicos`
            }
            trend="up"
          />

          <StatCard
            label="Por método de ingreso"
            value={`${summary.byMethod.event_qr} QR`}
            deltaLabel={`Carné: ${summary.byMethod.person_qr} · Manual: ${summary.byMethod.manual}`}
            trend="neutral"
          />

          <StatCard
            label="Mediana tiempo registro"
            value={
              summary.medianClientDurationMs !== null
                ? `${(summary.medianClientDurationMs / 1000).toFixed(1)} s`
                : '—'
            }
            deltaLabel="Indicador de agilidad del piloto"
            trend="neutral"
          />

          <StatCard
            label="Anulaciones auditadas"
            value={String(summary.totalVoided)}
            deltaLabel="Trazabilidad en AuditLog"
            trend="neutral"
          />
        </div>
      )}

      {/* Consola de Modo Quiosco (Carné QR) y Registro Manual */}
      {canWrite && event?.status === 'open' && (
        <Card
          title="Terminal de funcionario: Modo Quiosco y Registro Manual"
          description="Escanea el QR único del carné del participante o ingresa su documento manualmente."
        >
          <div className="mt-3 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={entryTab === 'kiosk' ? 'outline' : 'ghost'}
                size="sm"
                onClick={() => {
                  setEntryTab('kiosk');
                  setEntryFeedback(null);
                }}
              >
                <QrCode className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Modo Quiosco (Carné QR)
              </Button>
              <Button
                type="button"
                variant={entryTab === 'manual' ? 'outline' : 'ghost'}
                size="sm"
                onClick={() => {
                  setEntryTab('manual');
                  setEntryFeedback(null);
                }}
              >
                <UserPlus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Registro Manual
              </Button>
            </div>

            {/* Barra de estado de conexión y cola offline (IndexedDB) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <Wifi className="h-4 w-4 text-[var(--status-success-text)]" aria-hidden="true" />
                ) : (
                  <CloudOff
                    className="h-4 w-4 text-[var(--status-warning-text)]"
                    aria-hidden="true"
                  />
                )}
                <span className="font-medium text-[var(--text-heading)]">
                  {isOnline ? 'Conexión activa' : 'Modo sin conexión (Wi-Fi desconectado)'}
                </span>
                {pendingCount > 0 && (
                  <Badge status="warning">{pendingCount} pendiente(s) por sincronizar</Badge>
                )}
                {pendingCount === 0 && lastSyncSummary && lastSyncSummary.syncedCount > 0 && (
                  <Badge status="success">
                    {lastSyncSummary.syncedCount} sincronizada(s) automáticamente
                  </Badge>
                )}
              </div>

              {pendingCount > 0 && isOnline && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={syncingOffline}
                  onClick={() => void syncNow()}
                  data-testid="offline-sync-now-btn"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${syncingOffline ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {syncingOffline ? 'Sincronizando…' : 'Sincronizar ahora'}
                </Button>
              )}
            </div>

            {entryFeedback && (
              <div
                role="status"
                data-testid="staff-attendance-feedback"
                className={`rounded-[var(--radius-control)] border px-3.5 py-2.5 text-xs ${
                  entryFeedback.outcome === 'error'
                    ? 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
                    : entryFeedback.outcome === 'already_registered'
                      ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
                      : 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                }`}
              >
                {entryFeedback.message}
              </div>
            )}

            {entryTab === 'kiosk' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCameraActive((prev) => !prev)}
                    data-testid="kiosk-camera-toggle-btn"
                  >
                    {cameraActive ? (
                      <>
                        <CameraOff className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        Detener cámara QR
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        Activar cámara QR
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="kiosk-image-scan-btn"
                  >
                    <ImageUp className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    Escanear imagen QR
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => void handleScanImageFile(e)}
                  />
                </div>

                {cameraActive && (
                  <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-raised)] p-3 max-w-sm">
                    <video
                      ref={videoRef}
                      muted
                      playsInline
                      autoPlay
                      className="w-full h-52 object-cover rounded-[var(--radius-control)] bg-black"
                    />
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Acerca el código QR del carné a la cámara para registrar la asistencia
                      automáticamente.
                    </p>
                  </div>
                )}

                <form
                  onSubmit={(e) => void handleKioskSubmit(e)}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <input
                    type="text"
                    data-testid="kiosk-qr-input"
                    value={kioskQrToken}
                    onChange={(e) => setKioskQrToken(e.target.value)}
                    placeholder="Escanea con cámara, lector USB o escribe el token QR (ej. QR-JUAN-DEMO-01)"
                    className="flex-1 h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3.5 font-mono text-sm text-[var(--text-heading)]"
                  />
                  {/* Única acción cromática principal de la vista */}
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submittingEntry || kioskQrToken.trim().length < 6}
                    data-testid="kiosk-submit-btn"
                  >
                    {submittingEntry ? 'Registrando…' : 'Registrar carné QR'}
                  </Button>
                </form>
              </div>
            ) : (
              <form
                onSubmit={(e) => void handleManualSubmit(e)}
                className="flex flex-col sm:flex-row gap-3"
              >
                <select
                  value={manualMode}
                  onChange={(e) =>
                    setManualMode(e.target.value as 'document' | 'institutional_code')
                  }
                  className="h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-heading)]"
                >
                  <option value="document">Por documento</option>
                  <option value="institutional_code">Por código institucional</option>
                </select>
                <input
                  type="text"
                  data-testid="manual-identifier-input"
                  value={manualIdentifier}
                  onChange={(e) => setManualIdentifier(e.target.value)}
                  placeholder="Ingresa el número de documento o código estudiantil"
                  className="flex-1 h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3.5 font-mono text-sm text-[var(--text-heading)]"
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submittingEntry || manualIdentifier.trim().length < 3}
                  data-testid="manual-submit-btn"
                >
                  {submittingEntry ? 'Registrando…' : 'Registrar asistencia'}
                </Button>
              </form>
            )}
          </div>
        </Card>
      )}

      {/* Listado de asistentes con filtros y anulación */}
      <Card
        title="Registros de asistencia"
        description="Consulta las entradas por sesión y anula registros erróneos dejando constancia en auditoría."
      >
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--border)]">
          <div className="flex flex-wrap items-center gap-3">
            {event && event.sessions.length > 1 && (
              <select
                aria-label="Filtrar por sesión"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="h-9 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text-heading)]"
              >
                <option value="">Todas las sesiones</option>
                {event.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    Sesión {s.sessionNumber}: {s.title}
                  </option>
                ))}
              </select>
            )}

            <select
              aria-label="Filtrar por estado"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'valid' | 'voided')}
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text-heading)]"
            >
              <option value="all">Todos los estados</option>
              <option value="valid">Solo válidos</option>
              <option value="voided">Solo anulados</option>
            </select>
          </div>

          <span className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
            {attendanceData?.records.length ?? 0} registros mostrados
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                <th className="py-2.5 px-3 font-medium">Participante</th>
                <th className="py-2.5 px-3 font-medium">Documento / Código</th>
                <th className="py-2.5 px-3 font-medium">Sesión</th>
                <th className="py-2.5 px-3 font-medium">Método</th>
                <th className="py-2.5 px-3 font-medium">Hora (Bogotá)</th>
                <th className="py-2.5 px-3 font-medium">Estado</th>
                {canWrite && <th className="py-2.5 px-3 font-medium text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {attendanceData?.records.length === 0 ? (
                <tr>
                  <td
                    colSpan={canWrite ? 7 : 6}
                    className="py-8 text-center text-sm text-[var(--text-muted)]"
                  >
                    Aún no hay registros de asistencia para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                attendanceData?.records.map((rec) => (
                  <tr
                    key={rec.id}
                    className="hover:bg-[var(--surface-hover)]"
                    data-testid={`attendance-row-${rec.id}`}
                  >
                    <td className="py-2.5 px-3 font-medium text-[var(--text-heading)]">
                      {rec.personFullName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-[var(--text-body)]">
                      {rec.personDocumentType} {rec.personDocumentNumber}
                      {rec.personInstitutionalCode ? ` · ${rec.personInstitutionalCode}` : ''}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[var(--text-body)]">
                      S{rec.sessionNumber}: {rec.sessionLabel}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[var(--text-body)]">
                      {METHOD_LABELS[rec.method] ?? rec.method}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-xs text-[var(--text-body)]">
                      {formatBogotaTime(rec.checkedInAt)}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge status={rec.status === 'valid' ? 'success' : 'danger'}>
                        {rec.status === 'valid' ? 'Válido' : 'Anulado'}
                      </Badge>
                      {rec.voidReason && (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Motivo: {rec.voidReason}
                        </p>
                      )}
                    </td>
                    {canWrite && (
                      <td className="py-2.5 px-3 text-right">
                        {rec.status === 'valid' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setVoidTarget(rec);
                              setVoidReason('');
                            }}
                            data-testid={`void-btn-${rec.id}`}
                          >
                            Anular
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de confirmación para anular asistencia con motivo obligatorio */}
      {voidTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="void-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--status-danger-text)]">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              <h2
                id="void-modal-title"
                className="text-base font-medium text-[var(--text-heading)]"
              >
                Anular asistencia de {voidTarget.personFullName}
              </h2>
            </div>

            <p className="text-xs text-[var(--text-body)]">
              Esta acción queda registrada en el historial de auditoría (`AuditLog`) con tu usuario
              y hora exacta.
            </p>

            <form onSubmit={(e) => void handleVoidAttendance(e)} className="space-y-4">
              <div>
                <label
                  htmlFor="void-reason-input"
                  className="block text-xs font-medium text-[var(--text-heading)] mb-1"
                >
                  Motivo de anulación (mínimo 5 caracteres)
                </label>
                <textarea
                  id="void-reason-input"
                  data-testid="void-reason-input"
                  required
                  minLength={5}
                  rows={3}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Ej. Documento digitado por error de otro estudiante"
                  className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-sm text-[var(--text-heading)]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVoidTarget(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  className="border-[var(--status-danger-border)] text-[var(--status-danger-text)] hover:bg-[var(--status-danger-bg)]"
                  disabled={submittingVoid || voidReason.trim().length < 5}
                  data-testid="confirm-void-btn"
                >
                  {submittingVoid ? 'Anulando…' : 'Confirmar anulación'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
