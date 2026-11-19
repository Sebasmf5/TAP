import type { EventDto, EventQrResponse, EventStatus, EventType } from '@tap/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiClientError, apiDownloadFile, apiRequest } from '../../shared/api/http-client.ts';
import { useAuth } from '../../shared/auth/auth-context.tsx';
import {
  Badge,
  Button,
  Card,
  Input,
  Table,
  type BadgeStatus,
  type TableColumn,
} from '../../shared/ui/index.ts';

const STATUS_LABELS: Record<EventStatus, { label: string; badge: BadgeStatus }> = {
  draft: { label: 'Borrador', badge: 'neutral' },
  scheduled: { label: 'Programado', badge: 'info' },
  open: { label: 'Abierto (Check-in)', badge: 'success' },
  closed: { label: 'Cerrado', badge: 'warning' },
  cancelled: { label: 'Cancelado', badge: 'danger' },
};

const TYPE_LABELS: Record<EventType, string> = {
  mass: 'Evento masivo',
  course: 'Curso / Taller (sesiones)',
  recurring: 'Clase recurrente',
};

export function EventsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'org_admin' || user?.role === 'operator';

  const [events, setEvents] = useState<EventDto[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estado formulario creación
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<EventType>('mass');
  const [capacity, setCapacity] = useState('500');
  const [confirmIdentity, setConfirmIdentity] = useState(true);
  const [allowWalkIn, setAllowWalkIn] = useState(true);
  const [creating, setCreating] = useState(false);

  // Estado detalle y QR/PDF
  const [selectedEvent, setSelectedEvent] = useState<EventDto | null>(null);
  const [qrInfo, setQrInfo] = useState<EventQrResponse | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
        const list = await apiRequest<EventDto[]>(`/events${query}`);
        if (active) setEvents(list);
      } catch (err) {
        if (active && err instanceof ApiClientError) {
          setErrorMessage(err.detail);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [statusFilter]);

  const handleSelectEvent = async (eventItem: EventDto) => {
    setSelectedEvent(eventItem);
    try {
      const qr = await apiRequest<EventQrResponse>(`/events/${eventItem.id}/qr`);
      setQrInfo(qr);
    } catch {
      setQrInfo(null);
    }
  };

  const handleLifecycleAction = async (
    eventItem: EventDto,
    action: 'publish' | 'open' | 'close' | 'cancel',
  ) => {
    setErrorMessage(null);
    try {
      const updated = await apiRequest<EventDto>(`/events/${eventItem.id}/${action}`, {
        method: 'POST',
      });
      setEvents((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedEvent?.id === updated.id) {
        setSelectedEvent(updated);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      }
    }
  };

  const handleDuplicate = async (eventItem: EventDto) => {
    setErrorMessage(null);
    try {
      const duplicated = await apiRequest<EventDto>(`/events/${eventItem.id}/duplicate`, {
        method: 'POST',
        body: {},
      });
      setEvents((prev) => [duplicated, ...prev]);
      await handleSelectEvent(duplicated);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      }
    }
  };

  const handleDownloadPoster = async (eventItem: EventDto) => {
    setErrorMessage(null);
    try {
      await apiDownloadFile(
        `/events/${eventItem.id}/poster.pdf`,
        `afiche_${eventItem.publicCode.toLowerCase()}.pdf`,
      );
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      }
    }
  };

  const handleCreateEvent = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setCreating(true);

    const now = new Date();
    const startsAt = new Date(now.getTime() + 60 * 60_000);
    const endsAt = new Date(startsAt.getTime() + 3 * 3600_000);
    const secondSessionStart = new Date(startsAt.getTime() + 86_400_000);
    const secondSessionEnd = new Date(secondSessionStart.getTime() + 2 * 3600_000);

    try {
      const created = await apiRequest<EventDto>('/events', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || null,
          type,
          startsAt: startsAt.toISOString(),
          endsAt: (type === 'course' ? secondSessionEnd : endsAt).toISOString(),
          capacity: capacity ? Number(capacity) : null,
          confirmIdentity,
          allowWalkIn,
          sessions:
            type === 'course'
              ? [
                  {
                    title: 'Sesión 1 — Fundamentos',
                    startsAt: startsAt.toISOString(),
                    endsAt: endsAt.toISOString(),
                  },
                  {
                    title: 'Sesión 2 — Práctica aplicada',
                    startsAt: secondSessionStart.toISOString(),
                    endsAt: secondSessionEnd.toISOString(),
                  },
                ]
              : undefined,
        },
      });
      setEvents((prev) => [created, ...prev]);
      setName('');
      setDescription('');
      await handleSelectEvent(created);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('No fue posible crear el evento.');
      }
    } finally {
      setCreating(false);
    }
  };

  const columns: TableColumn<EventDto>[] = [
    {
      key: 'name',
      header: 'Evento / Actividad',
      render: (row) => (
        <div>
          <p className="font-medium text-[var(--text-heading)]">{row.name}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {TYPE_LABELS[row.type]} · {row.sessions.length} sesión(es)
          </p>
        </div>
      ),
    },
    {
      key: 'publicCode',
      header: 'Código público QR',
      mono: true,
      render: (row) => (
        <span className="font-mono text-xs px-2 py-1 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)]">
          /c/{row.publicCode}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => {
        const meta = STATUS_LABELS[row.status];
        return <Badge status={meta.badge}>{meta.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Gestión y QR',
      align: 'right',
      render: (row) => (
        <div className="inline-flex items-center gap-2">
          <Link to={`/app/events/${row.id}/attendance`}>
            <Button type="button" variant="outline" size="sm">
              Asistencia en vivo
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSelectEvent(row)}
          >
            Detalle y QR
          </Button>
          {canEdit && row.status === 'draft' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleLifecycleAction(row, 'publish')}
            >
              Publicar
            </Button>
          )}
          {canEdit && (row.status === 'draft' || row.status === 'scheduled') && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleLifecycleAction(row, 'open')}
            >
              Abrir
            </Button>
          )}
          {canEdit && row.status === 'open' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleLifecycleAction(row, 'close')}
            >
              Cerrar
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
            Actividades y asistencia
          </p>
          <h1 className="mt-1 text-2xl font-light text-[var(--text-heading)] tracking-tight">
            Eventos, talleres y jornadas masivas
          </h1>
          <p className="mt-1 text-sm text-[var(--text-body)]">
            Configura ventanas de check-in, reglas de certificado y descarga el afiche PDF con
            código QR.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Filtrar eventos por estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text-heading)]"
          >
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="scheduled">Programado</option>
            <option value="open">Abierto</option>
            <option value="closed">Cerrado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-sm text-[var(--status-danger-text)]"
        >
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <Card
            title="Eventos de la entidad"
            description={
              loading ? 'Cargando eventos…' : `${events.length} actividades configuradas.`
            }
          >
            <Table
              columns={columns}
              rows={events}
              getRowKey={(row) => row.id}
              emptyMessage="Aún no hay eventos creados en esta entidad."
            />
          </Card>

          {selectedEvent && (
            <Card
              title={`Detalle del evento — ${selectedEvent.name}`}
              description={`Check-in: /c/${selectedEvent.publicCode} · Preregistro: /r/${selectedEvent.publicCode} · Estado: ${STATUS_LABELS[selectedEvent.status].label}`}
            >
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                {qrInfo && (
                  <div className="flex flex-col items-center p-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-raised)]">
                    <img
                      src={qrInfo.qrDataUrl}
                      alt={`QR de ${selectedEvent.name}`}
                      className="h-44 w-44 rounded-[var(--radius-control)] border border-[var(--border)] bg-white p-2"
                    />
                    <p className="mt-2 font-mono text-xs text-[var(--text-heading)]">
                      {qrInfo.checkinUrl}
                    </p>
                  </div>
                )}

                <div className="space-y-3 text-sm">
                  <p className="text-[var(--text-body)]">
                    {selectedEvent.description ?? 'Sin descripción adicional.'}
                  </p>
                  <div className="text-xs text-[var(--text-muted)] space-y-1">
                    <p>
                      Confirmar identidad («Juan P.»):{' '}
                      <strong className="text-[var(--text-heading)]">
                        {selectedEvent.confirmIdentity ? 'Sí' : 'No'}
                      </strong>
                    </p>
                    <p>
                      Permitir registro espontáneo (Walk-in):{' '}
                      <strong className="text-[var(--text-heading)]">
                        {selectedEvent.allowWalkIn ? 'Sí' : 'No'}
                      </strong>
                    </p>
                    <p>
                      Sesiones configuradas:{' '}
                      <strong className="text-[var(--text-heading)]">
                        {selectedEvent.sessions.length}
                      </strong>
                    </p>
                  </div>

                  <div className="pt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDownloadPoster(selectedEvent)}
                    >
                      Descargar afiche PDF
                    </Button>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDuplicate(selectedEvent)}
                      >
                        Duplicar evento
                      </Button>
                    )}
                    {canEdit &&
                      selectedEvent.status !== 'closed' &&
                      selectedEvent.status !== 'cancelled' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleLifecycleAction(selectedEvent, 'cancel')}
                        >
                          Cancelar evento
                        </Button>
                      )}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {canEdit && (
          <Card
            title="Nuevo evento (Factory + Builder)"
            description="Ajusta las reglas por defecto según el tipo de actividad."
          >
            <form onSubmit={(e) => void handleCreateEvent(e)} className="mt-2 space-y-4">
              <Input
                label="Nombre del evento o curso"
                placeholder="Ej. Jornada de Bienestar y Salud"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <Input
                label="Descripción breve"
                placeholder="Lugar, público objetivo o indicaciones"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <div>
                <label
                  htmlFor="event-type-select"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
                >
                  Tipo de evento
                </label>
                <select
                  id="event-type-select"
                  value={type}
                  onChange={(e) => {
                    const nextType = e.target.value as EventType;
                    setType(nextType);
                    setAllowWalkIn(nextType === 'mass');
                  }}
                  className="w-full h-10 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-heading)]"
                >
                  <option value="mass">Evento masivo (1 sesión, walk-in activo)</option>
                  <option value="course">Curso o taller (múltiples sesiones, ≥80%)</option>
                  <option value="recurring">Clase recurrente</option>
                </select>
              </div>

              <Input
                label="Aforo máximo estimado"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />

              <div className="space-y-2 text-xs text-[var(--text-body)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={confirmIdentity}
                    onChange={(e) => setConfirmIdentity(e.target.checked)}
                  />
                  <span>Mostrar confirmación «Juan P.» antes de registrar</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowWalkIn}
                    onChange={(e) => setAllowWalkIn(e.target.checked)}
                  />
                  <span>Permitir registro rápido si no está en el directorio</span>
                </label>
              </div>

              {/* Única acción cromática principal de la vista */}
              <Button type="submit" variant="primary" className="w-full" disabled={creating}>
                {creating ? 'Creando evento…' : 'Crear evento'}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
