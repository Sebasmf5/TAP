import type { OrganizationDto, SiteDto, UserProfile } from '@tap/contracts';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { apiRequest } from '../../shared/api/http-client.ts';
import { ROLE_LABELS, useAuth } from '../../shared/auth/auth-context.tsx';
import {
  Badge,
  Button,
  Card,
  StatCard,
  TapPanelAccentIllustration,
} from '../../shared/ui/index.ts';

const FEATURE_LABELS: Record<string, string> = {
  attendance: 'Asistencia rápida con QR',
  certificates: 'Certificados PDF verificables',
  inventory: 'Inventario de implementos',
  loans: 'Préstamos con firma digital',
  reports: 'Reportes y estadísticas',
  kioskMode: 'Modo kiosco con carné QR',
  googleSso: 'Acceso institucional Google',
  marketing: 'Campañas publicitarias (Ley 2300)',
};

export function DashboardHomePage() {
  const { user } = useAuth();
  const [organization, setOrganization] = useState<OrganizationDto | null>(null);
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [usersCount, setUsersCount] = useState<number | null>(null);
  const [orgsCount, setOrgsCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (user?.role === 'platform_admin') {
        try {
          const allOrgs = await apiRequest<OrganizationDto[]>('/platform/organizations');
          if (active) setOrgsCount(allOrgs.length);
        } catch {
          // Ignorar errores de carga inicial
        }
      }
      if (user?.organizationId) {
        try {
          const [org, orgSites] = await Promise.all([
            apiRequest<OrganizationDto>('/organization'),
            apiRequest<SiteDto[]>('/sites'),
          ]);
          if (active) {
            setOrganization(org);
            setSites(orgSites);
          }
        } catch {
          // Ignorar errores de carga inicial
        }

        if (user.role === 'org_admin') {
          try {
            const staff = await apiRequest<UserProfile[]>('/users');
            if (active) setUsersCount(staff.filter((u) => u.status === 'active').length);
          } catch {
            // Ignorar errores de carga inicial
          }
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.organizationId, user?.role]);

  if (!user) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
            Panel de operación
          </p>
          <h1
            className="mt-1 text-2xl font-light text-[var(--text-heading)] tracking-tight"
            data-testid="dashboard-heading"
          >
            Hola, {user.fullName}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-body)]">
            Sesión iniciada como <span className="font-medium">{ROLE_LABELS[user.role]}</span>
            {organization ? ` en ${organization.name}` : ' en la consola central de Tap'}.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <TapPanelAccentIllustration className="hidden md:block w-36 h-auto shrink-0" />
          {/* Única acción cromática principal de la vista */}
          {user.role === 'platform_admin' ? (
            <Link to="/app/platform/organizations" className="w-full sm:w-auto">
              <Button variant="primary" className="w-full sm:w-auto">
                Administrar entidades
              </Button>
            </Link>
          ) : organization?.features.attendance && !organization?.features.inventory ? (
            <Link to="/app/events" className="w-full sm:w-auto">
              <Button variant="primary" className="w-full sm:w-auto">
                Gestionar eventos y asistencia
              </Button>
            </Link>
          ) : (
            <Link to="/app/loans" className="w-full sm:w-auto">
              <Button variant="primary" className="w-full sm:w-auto">
                Gestionar préstamos e inventario
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Tarjetas de resumen con cifras tabulares */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Estado de tu cuenta"
          value="Activa"
          deltaLabel="Autenticación Ed25519 verificada"
          trend="up"
        />

        {user.role === 'platform_admin' ? (
          <StatCard
            label="Entidades registradas"
            value={orgsCount !== null ? String(orgsCount) : '—'}
            deltaLabel="Aislamiento multi-tenant activo"
            trend="neutral"
          />
        ) : (
          <StatCard
            label="Sedes y puntos QR"
            value={String(sites.filter((s) => s.isActive).length)}
            deltaLabel={`${sites.length} registradas en total`}
            trend="up"
          />
        )}

        {user.role === 'org_admin' && (
          <StatCard
            label="Funcionarios activos"
            value={usersCount !== null ? String(usersCount) : '—'}
            deltaLabel="Control de acceso por rol"
            trend="neutral"
          />
        )}

        {organization && (
          <StatCard
            label="Retención Ley 1581"
            value={`${organization.retentionDays} días`}
            deltaLabel={`Autorización ${organization.dataConsentVersion}`}
            trend="neutral"
          />
        )}
      </div>

      {organization && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card
            title="Módulos habilitados en tu plan"
            description="Controlados por FeatureGate según el plan contratado por la entidad."
          >
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Object.entries(organization.features).map(([key, enabled]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
                >
                  <span className="text-[var(--text-body)]">{FEATURE_LABELS[key] ?? key}</span>
                  <Badge status={enabled ? 'success' : 'neutral'}>
                    {enabled ? 'Activo' : 'No incluido'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Accesos directos de configuración"
            description="Gestiona las sedes físicas, códigos QR y cuentas del personal de apoyo."
          >
            <div className="mt-2 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-heading)]">
                    Sedes y puntos QR
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Descarga e imprime el código QR único de cada punto.
                  </p>
                </div>
                <Link to="/app/sites" className="shrink-0">
                  <Button variant="outline" size="sm" className="w-full sm:w-auto">
                    Abrir sedes
                  </Button>
                </Link>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-heading)]">
                    Parámetros de la entidad
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Dominios de correo autorizados y texto de tratamiento de datos.
                  </p>
                </div>
                <Link to="/app/organization" className="shrink-0">
                  <Button variant="outline" size="sm" className="w-full sm:w-auto">
                    Configurar
                  </Button>
                </Link>
              </div>

              {user.role === 'org_admin' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-heading)]">
                      Equipo de funcionarios
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Crea cuentas de operador o consulta y revoca accesos al instante.
                    </p>
                  </div>
                  <Link to="/app/users" className="shrink-0">
                    <Button variant="outline" size="sm" className="w-full sm:w-auto">
                      Gestionar usuarios
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
