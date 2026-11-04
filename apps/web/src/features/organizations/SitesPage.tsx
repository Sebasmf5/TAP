import type { SiteDto } from '@tap/contracts';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { useAuth } from '../../shared/auth/auth-context.tsx';
import { Badge, Button, Card, Input, Table, type TableColumn } from '../../shared/ui/index.ts';

export function SitesPage() {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'org_admin';

  const [sites, setSites] = useState<SiteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [creating, setCreating] = useState(false);

  const [selectedSite, setSelectedSite] = useState<SiteDto | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await apiRequest<SiteDto[]>('/sites');
        if (active) setSites(list);
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
  }, []);

  const handleOpenQrPoster = async (site: SiteDto) => {
    setSelectedSite(site);
    const publicUrl = `${window.location.origin}/p/${site.loanPointCode}`;
    const dataUrl = await QRCode.toDataURL(publicUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#061b31',
        light: '#ffffff',
      },
    });
    setQrDataUrl(dataUrl);
  };

  const handleCreateSite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setCreating(true);
    try {
      const created = await apiRequest<SiteDto>('/sites', {
        method: 'POST',
        body: {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          address: address.trim() || null,
        },
      });
      setSites((prev) => [...prev, created]);
      setName('');
      setCode('');
      setAddress('');
      await handleOpenQrPoster(created);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('No fue posible crear la sede.');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (site: SiteDto) => {
    setErrorMessage(null);
    try {
      const updated = await apiRequest<SiteDto>(`/sites/${site.id}`, {
        method: 'PATCH',
        body: { isActive: !site.isActive },
      });
      setSites((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      }
    }
  };

  const columns: TableColumn<SiteDto>[] = [
    {
      key: 'name',
      header: 'Sede o punto de atención',
      render: (row) => (
        <div>
          <p className="font-medium text-[var(--text-heading)]">{row.name}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {row.address ?? 'Sin dirección física'}
          </p>
        </div>
      ),
    },
    {
      key: 'code',
      header: 'Código interno',
      render: (row) => <span className="font-mono text-xs">{row.code}</span>,
    },
    {
      key: 'loanPointCode',
      header: 'Código público QR',
      render: (row) => (
        <span className="font-mono text-xs px-2 py-1 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)]">
          /p/{row.loanPointCode}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Estado',
      render: (row) => (
        <Badge status={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? 'Habilitada' : 'Inactiva'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Cartel y acciones',
      align: 'right',
      render: (row) => (
        <div className="inline-flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleOpenQrPoster(row)}
          >
            Ver cartel QR
          </Button>
          {isOrgAdmin && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleToggleActive(row)}
            >
              {row.isActive ? 'Pausar' : 'Activar'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
          Infraestructura física
        </p>
        <h1 className="mt-1 text-2xl font-light text-[var(--text-heading)] tracking-tight">
          Sedes y puntos QR de préstamo
        </h1>
        <p className="mt-1 text-sm text-[var(--text-body)]">
          Cada sede cuenta con un código público de alta entropía para que las personas soliciten
          implementos escaneando el cartel con la cámara del celular.
        </p>
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
            title="Sedes registradas"
            description={loading ? 'Cargando sedes…' : `${sites.length} puntos configurados.`}
          >
            <div className="mt-2">
              <Table
                columns={columns}
                rows={sites}
                getRowKey={(row) => row.id}
                emptyMessage="Aún no hay sedes registradas en esta entidad."
              />
            </div>
          </Card>

          {selectedSite && qrDataUrl && (
            <Card
              title={`Cartel QR imprimible — ${selectedSite.name}`}
              description="Imprime este cartel y ubícalo en el mostrador o punto de entrega de implementos."
            >
              <div className="mt-3 flex flex-col sm:flex-row items-center gap-6 p-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-raised)]">
                <img
                  src={qrDataUrl}
                  alt={`Código QR del punto de préstamo ${selectedSite.name}`}
                  className="h-44 w-44 rounded-[var(--radius-control)] border border-[var(--border)] bg-white p-2"
                />
                <div className="space-y-2 text-sm">
                  <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
                    Punto público de préstamo
                  </p>
                  <p className="text-lg font-medium text-[var(--text-heading)]">
                    {selectedSite.name}
                  </p>
                  <p className="font-mono text-xs text-[var(--text-body)]">
                    URL pública: {window.location.origin}/p/{selectedSite.loanPointCode}
                  </p>
                  <p className="font-mono text-xs text-[var(--text-muted)]">
                    Código corto: {selectedSite.loanPointCode}
                  </p>
                  <div className="pt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                    >
                      Imprimir cartel
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedSite(null);
                        setQrDataUrl(null);
                      }}
                    >
                      Cerrar vista previa
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {isOrgAdmin && (
          <Card
            title="Registrar nueva sede"
            description="Generará automáticamente su código QR único para préstamos."
          >
            <form onSubmit={(e) => void handleCreateSite(e)} className="mt-2 space-y-4">
              <Input
                label="Nombre de la sede o punto"
                placeholder="Ej. Coliseo Cubierto / Gimnasio Central"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <Input
                label="Código interno (2-24 caracteres)"
                placeholder="Ej. COLISEO-01"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
              />

              <Input
                label="Ubicación o bloque"
                placeholder="Ej. Campus Central — Bloque Deportivo"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />

              {/* Única acción cromática principal de la vista */}
              <Button type="submit" variant="primary" className="w-full" disabled={creating}>
                {creating ? 'Creando sede…' : 'Crear sede y generar QR'}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
