import type { OrganizationDto, OrganizationType } from '@tap/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { useAuth } from '../../shared/auth/auth-context.tsx';
import { Badge, Button, Card, Input } from '../../shared/ui/index.ts';

const ORG_TYPE_LABELS: Record<OrganizationType, string> = {
  institucion_educativa: 'Institución educativa / Bienestar universitario',
  ente_deportivo: 'Ente deportivo municipal o departamental',
  caja: 'Caja de compensación familiar',
  gimnasio: 'Gimnasio o centro de acondicionamiento',
  empresa: 'Empresa privada',
  otro: 'Otra organización',
};

export function OrganizationSettingsPage() {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'org_admin';

  const [organization, setOrganization] = useState<OrganizationDto | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<OrganizationType>('institucion_educativa');
  const [domainsInput, setDomainsInput] = useState('');
  const [consentVersion, setConsentVersion] = useState('');
  const [consentText, setConsentText] = useState('');
  const [retentionDays, setRetentionDays] = useState(1095);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const org = await apiRequest<OrganizationDto>('/organization');
        if (!active) return;
        setOrganization(org);
        setName(org.name);
        setType(org.type);
        setDomainsInput(org.allowedEmailDomains.join(', '));
        setConsentVersion(org.dataConsentVersion);
        setConsentText(org.dataConsentText);
        setRetentionDays(org.retentionDays);
      } catch (err) {
        if (active && err instanceof ApiClientError) {
          setErrorMessage(err.detail);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOrgAdmin) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setSaving(true);

    const allowedEmailDomains = domainsInput
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    try {
      const updated = await apiRequest<OrganizationDto>('/organization', {
        method: 'PATCH',
        body: {
          name: name.trim(),
          type,
          allowedEmailDomains,
          dataConsentVersion: consentVersion.trim(),
          dataConsentText: consentText.trim(),
          retentionDays: Number(retentionDays),
        },
      });
      setOrganization(updated);
      setSuccessMessage('Ajustes de la entidad guardados correctamente.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('No fue posible guardar los cambios.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!organization) {
    return (
      <p className="text-sm text-[var(--text-muted)]">Cargando configuración de la entidad…</p>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
          Entidad y cumplimiento legal
        </p>
        <h1 className="mt-1 text-2xl font-light text-[var(--text-heading)] tracking-tight">
          Configuración de {organization.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-body)]">
          Define los dominios de correo permitidos para el personal y el texto versionado de
          autorización de datos personales (Ley 1581 de 2012).
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
      {successMessage && (
        <div
          role="status"
          className="rounded-[var(--radius-control)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3.5 py-2.5 text-sm text-[var(--status-success-text)]"
        >
          {successMessage}
        </div>
      )}

      <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
        <Card
          title="Identidad institucional"
          description="Información visible en encabezados, certificados PDF y puntos públicos."
        >
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nombre oficial de la entidad"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isOrgAdmin}
              required
            />

            <div>
              <label
                htmlFor="org-type-select"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
              >
                Tipo de organización
              </label>
              <select
                id="org-type-select"
                value={type}
                onChange={(e) => setType(e.target.value as OrganizationType)}
                disabled={!isOrgAdmin}
                className="w-full h-10 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-heading)]"
              >
                {Object.entries(ORG_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                Identificador único (slug)
              </span>
              <p className="font-mono text-sm text-[var(--text-heading)] px-3 py-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)]">
                {organization.slug}
              </p>
            </div>

            <div>
              <span className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                Zona horaria operativa
              </span>
              <p className="font-mono text-sm text-[var(--text-heading)] px-3 py-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)]">
                {organization.timezone}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Input
              label="Dominios de correo autorizados para funcionarios (separados por coma; vacío permite todos)"
              placeholder="Ej. uceva.edu.co, bienestar.gov.co"
              value={domainsInput}
              onChange={(e) => setDomainsInput(e.target.value)}
              disabled={!isOrgAdmin}
            />
          </div>
        </Card>

        <Card
          title="Protección de datos personales (Ley 1581 de 2012)"
          description="El formulario público de préstamo permanece bloqueado hasta que la persona acepta expresamente esta versión."
        >
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Versión del texto de autorización"
              value={consentVersion}
              onChange={(e) => setConsentVersion(e.target.value)}
              disabled={!isOrgAdmin}
              required
            />

            <Input
              label="Plazo de retención de registros (días)"
              type="number"
              min={30}
              max={3650}
              value={String(retentionDays)}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              disabled={!isOrgAdmin}
              required
            />
          </div>

          <div className="mt-4">
            <label
              htmlFor="consent-textarea"
              className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
            >
              Texto de autorización previa, expresa e informada
            </label>
            <textarea
              id="consent-textarea"
              rows={4}
              value={consentText}
              onChange={(e) => setConsentText(e.target.value)}
              disabled={!isOrgAdmin}
              className="w-full p-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-heading)]"
              required
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>
              Nota: Los textos legales deben ser validados por la oficina jurídica de cada entidad.
            </span>
            <Badge status="info">Versión activa: {organization.dataConsentVersion}</Badge>
          </div>
        </Card>

        {isOrgAdmin && (
          <div className="flex justify-end">
            {/* Única acción cromática principal de la vista */}
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Guardando cambios…' : 'Guardar configuración'}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
