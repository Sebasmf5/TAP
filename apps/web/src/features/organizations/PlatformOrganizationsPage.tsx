import type {
  FeatureKey,
  OrganizationDto,
  OrganizationPlan,
  OrganizationType,
} from '@tap/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { Badge, Button, Card, Input, Table, type TableColumn } from '../../shared/ui/index.ts';

export function PlatformOrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState<OrganizationType>('institucion_educativa');
  const [plan, setPlan] = useState<OrganizationPlan>('institutional');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await apiRequest<OrganizationDto[]>('/platform/organizations');
        if (active) setOrganizations(list);
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

  const handleCreateOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setCreating(true);
    try {
      const created = await apiRequest<OrganizationDto>('/platform/organizations', {
        method: 'POST',
        body: {
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          type,
          plan,
        },
      });
      setOrganizations((prev) => [...prev, created]);
      setName('');
      setSlug('');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('No fue posible registrar la entidad.');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggleFeature = async (org: OrganizationDto, featureKey: FeatureKey) => {
    setErrorMessage(null);
    try {
      const updated = await apiRequest<OrganizationDto>(`/platform/organizations/${org.id}`, {
        method: 'PATCH',
        body: {
          features: {
            ...org.features,
            [featureKey]: !org.features[featureKey],
          },
        },
      });
      setOrganizations((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      }
    }
  };

  const columns: TableColumn<OrganizationDto>[] = [
    {
      key: 'name',
      header: 'Entidad (Tenant)',
      render: (row) => (
        <div>
          <p className="font-medium text-[var(--text-heading)]">{row.name}</p>
          <p className="font-mono text-xs text-[var(--text-muted)]">{row.slug}</p>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (row) => (
        <Badge status="info">
          {row.plan === 'institutional'
            ? 'Institucional'
            : row.plan === 'standard'
              ? 'Estándar'
              : 'Piloto'}
        </Badge>
      ),
    },
    {
      key: 'features',
      header: 'Módulos activos (FeatureGate)',
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {(['attendance', 'certificates', 'inventory', 'loans'] as const).map((key) => (
            <Button
              key={key}
              type="button"
              variant={row.features[key] ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => void handleToggleFeature(row, key)}
            >
              {key === 'attendance'
                ? 'Asistencia'
                : key === 'certificates'
                  ? 'Certificados'
                  : key === 'inventory'
                    ? 'Inventario'
                    : 'Préstamos'}
              : {row.features[key] ? 'Sí' : 'No'}
            </Button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
          Administración multi-entidad
        </p>
        <h1 className="mt-1 text-2xl font-light text-[var(--text-heading)] tracking-tight">
          Entidades y planes (FeatureGate)
        </h1>
        <p className="mt-1 text-sm text-[var(--text-body)]">
          Cada entidad opera con aislamiento lógico estricto por{' '}
          <code className="font-mono">organization_id</code>.
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
        <div className="lg:col-span-2">
          <Card
            title="Entidades activas en la plataforma"
            description={
              loading ? 'Cargando entidades…' : `${organizations.length} entidades registradas.`
            }
          >
            <div className="mt-2">
              <Table
                columns={columns}
                rows={organizations}
                getRowKey={(row) => row.id}
                emptyMessage="No hay entidades registradas."
              />
            </div>
          </Card>
        </div>

        <Card
          title="Alta de nueva entidad"
          description="Crea el espacio aislado para una nueva institución o ente deportivo."
        >
          <form onSubmit={(e) => void handleCreateOrganization(e)} className="mt-2 space-y-4">
            <Input
              label="Nombre de la entidad"
              placeholder="Ej. Inder Municipal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <Input
              label="Identificador URL (slug)"
              placeholder="Ej. inder-municipal"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              required
            />

            <div>
              <label
                htmlFor="new-org-type"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
              >
                Tipo de entidad
              </label>
              <select
                id="new-org-type"
                value={type}
                onChange={(e) => setType(e.target.value as OrganizationType)}
                className="w-full h-10 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-heading)]"
              >
                <option value="institucion_educativa">Institución educativa</option>
                <option value="ente_deportivo">Ente deportivo</option>
                <option value="caja">Caja de compensación</option>
                <option value="gimnasio">Gimnasio</option>
                <option value="empresa">Empresa</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="new-org-plan"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
              >
                Plan comercial
              </label>
              <select
                id="new-org-plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value as OrganizationPlan)}
                className="w-full h-10 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-heading)]"
              >
                <option value="pilot">Piloto</option>
                <option value="standard">Estándar</option>
                <option value="institutional">Institucional</option>
              </select>
            </div>

            {/* Única acción cromática principal de la vista */}
            <Button type="submit" variant="primary" className="w-full" disabled={creating}>
              {creating ? 'Creando entidad…' : 'Crear entidad'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
