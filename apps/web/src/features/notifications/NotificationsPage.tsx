import type {
  ListNotificationsResponse,
  MarketingCampaignResponse,
  NotificationDto,
  NotificationStatus,
  OrganizationDto,
} from '@tap/contracts';
import { Megaphone, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { Badge, Button, Card, Input, StatCard } from '../../shared/ui/index.ts';

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
  const outletContext = useOutletContext<{ organization: OrganizationDto | null } | undefined>();
  const canSendMarketing = Boolean(outletContext?.organization?.features.marketing);

  const [data, setData] = useState<ListNotificationsResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<NotificationStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Campañas publicitarias (Opción 3: Certificados + Publicidad, Ley 2300 de 2023)
  const [campaignSubject, setCampaignSubject] = useState('');
  const [campaignMessage, setCampaignMessage] = useState('');
  const [campaignCtaUrl, setCampaignCtaUrl] = useState('');
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [campaignResult, setCampaignResult] = useState<MarketingCampaignResponse | null>(null);

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

  const handleSendCampaign = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setCampaignResult(null);
    setSendingCampaign(true);
    try {
      const res = await apiRequest<MarketingCampaignResponse>('/notifications/marketing-campaign', {
        method: 'POST',
        body: {
          subject: campaignSubject.trim(),
          message: campaignMessage.trim(),
          ctaLabel: campaignCtaUrl.trim() ? 'Ver nuevo evento' : undefined,
          ctaUrl: campaignCtaUrl.trim() || undefined,
        },
      });
      setCampaignResult(res);
      setCampaignSubject('');
      setCampaignMessage('');
      setCampaignCtaUrl('');
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError
          ? err.detail
          : 'No fue posible enviar la campaña publicitaria.',
      );
    } finally {
      setSendingCampaign(false);
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

      {canSendMarketing && (
        <Card
          title="Campañas publicitarias de nuevos eventos"
          description="Envía anuncios por correo únicamente a participantes que marcaron el consentimiento publicitario opcional (Ley 1581 y Ley 2300 de 2023)."
        >
          {campaignResult && (
            <div className="mb-4 rounded-[var(--radius-control)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-xs text-[var(--status-success-text)]">
              Campaña encolada para <strong>{campaignResult.recipientsCount}</strong>{' '}
              destinatario(s) con consentimiento vigente. Se omitieron{' '}
              <strong>{campaignResult.skippedWithoutConsentCount}</strong> registro(s) sin
              autorización publicitaria.
            </div>
          )}

          <form onSubmit={(e) => void handleSendCampaign(e)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Asunto del correo"
                value={campaignSubject}
                onChange={(e) => setCampaignSubject(e.target.value)}
                placeholder="Ej: ¡Inscríbete a la Copa Deportiva 2026!"
                minLength={4}
                required
              />
              <Input
                label="Enlace del evento (opcional)"
                type="url"
                value={campaignCtaUrl}
                onChange={(e) => setCampaignCtaUrl(e.target.value)}
                placeholder="https://tap.sebasmf.dev/c/NUEVO1"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="campaign-message-input"
                className="block text-sm font-normal text-[var(--text-heading)]"
              >
                Mensaje promocional
              </label>
              <textarea
                id="campaign-message-input"
                rows={4}
                required
                minLength={10}
                value={campaignMessage}
                onChange={(e) => setCampaignMessage(e.target.value)}
                placeholder="Cuéntales a tus asistentes sobre el próximo evento, fecha, lugar y cómo registrarse."
                className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-[var(--text-muted)]">
                Incluye automáticamente pie legal con opción de baja (Ley 2300 de 2023).
              </span>
              <Button
                type="submit"
                variant="primary"
                disabled={sendingCampaign || !campaignSubject.trim() || !campaignMessage.trim()}
                data-testid="send-marketing-campaign-btn"
              >
                <Megaphone className="h-4 w-4" aria-hidden="true" />
                {sendingCampaign ? 'Enviando campaña…' : 'Enviar campaña publicitaria'}
              </Button>
            </div>
          </form>
        </Card>
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
