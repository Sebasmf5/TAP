import type {
  ListNotificationsResponse,
  NotificationDto,
  NotificationStatus,
} from '@tap/contracts';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { Badge, Button, Card, StatCard } from '../../shared/ui/index.ts';

function formatBogotaDateTime(iso: string): string {
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

export function NotificationsPage() {
  const [data, setData] = useState<ListNotificationsResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<NotificationStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const qs = statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : '';
        const res = await apiRequest<ListNotificationsResponse>(`/notifications${qs}`);
        if (active) {
          setData(res);
          setErrorMessage(null);
        }
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof ApiClientError
              ? err.detail
              : 'No fue posible consultar el registro de notificaciones.',
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
  }, [statusFilter, reloadKey]);

  const handleRetry = async (item: NotificationDto) => {
    setRetryingId(item.id);
    setErrorMessage(null);
    try {
      await apiRequest<NotificationDto>(`/notifications/${item.id}/retry`, {
        method: 'POST',
      });
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudo reintentar la notificación.',
      );
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-normal text-[var(--text-heading)]">
            Registro de notificaciones
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Envíos transaccionales de certificados y préstamos con deduplicación y reintento.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(['all', 'sent', 'queued', 'failed'] as const).map((st) => (
            <Button
              key={st}
              type="button"
              variant={statusFilter === st ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(st)}
            >
              {st === 'all'
                ? 'Todas'
                : st === 'sent'
                  ? 'Enviadas'
                  : st === 'queued'
                    ? 'En cola'
                    : 'Fallidas'}
            </Button>
          ))}
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

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatCard
            label="Total registradas"
            value={String(data.totalCount)}
            hint="Deduplicadas por clave única"
          />
          <StatCard
            label="Enviadas"
            value={String(data.sentCount)}
            hint="Entregadas al canal configurado"
          />
          <StatCard label="En cola" value={String(data.queuedCount)} hint="Pendientes en pg-boss" />
          <StatCard
            label="Fallidas"
            value={String(data.failedCount)}
            hint="Disponibles para reintento manual"
          />
        </div>
      )}

      <Card
        title="Historial de envíos"
        description="Cada notificación queda vinculada a la entidad originadora (certificado o préstamo)."
      >
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Cargando notificaciones…</p>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No hay notificaciones registradas con el filtro seleccionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                  <th className="py-2 pr-3 font-medium">Plantilla</th>
                  <th className="py-2 px-3 font-medium">Destinatario</th>
                  <th className="py-2 px-3 font-medium">Asunto</th>
                  <th className="py-2 px-3 font-medium">Estado</th>
                  <th className="py-2 px-3 font-medium">Intentos</th>
                  <th className="py-2 px-3 font-medium">Fecha</th>
                  <th className="py-2 pl-3 text-right font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--surface-hover)]">
                    <td className="py-2.5 pr-3 font-mono text-[var(--text-heading)]">
                      {item.template}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-body)]">{item.recipient}</td>
                    <td className="py-2.5 px-3 text-[var(--text-heading)]">{item.subject}</td>
                    <td className="py-2.5 px-3">
                      {item.status === 'sent' ? (
                        <Badge status="success">Enviada</Badge>
                      ) : item.status === 'queued' ? (
                        <Badge status="info">En cola</Badge>
                      ) : (
                        <Badge status="danger">Fallida</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--text-heading)]">
                      {item.attempts}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--text-muted)]">
                      {formatBogotaDateTime(item.sentAt ?? item.createdAt)}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      {item.status !== 'sent' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={retryingId === item.id}
                          onClick={() => void handleRetry(item)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          Reintentar
                        </Button>
                      )}
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
