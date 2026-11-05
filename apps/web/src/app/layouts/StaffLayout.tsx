import type { OrganizationDto } from '@tap/contracts';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { apiRequest } from '../../shared/api/http-client.ts';
import { ROLE_LABELS, useAuth } from '../../shared/auth/auth-context.tsx';
import { Badge, Button, ThemeToggle } from '../../shared/ui/index.ts';

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly end?: boolean;
}

export function StaffLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [fetchedOrganization, setFetchedOrganization] = useState<OrganizationDto | null>(null);

  useEffect(() => {
    let active = true;
    if (!user?.organizationId) {
      return;
    }
    void (async () => {
      try {
        const org = await apiRequest<OrganizationDto>('/organization');
        if (active) setFetchedOrganization(org);
      } catch {
        if (active) setFetchedOrganization(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.organizationId]);

  const organization = user?.organizationId ? fetchedOrganization : null;

  if (!user) {
    return null;
  }

  const navItems: NavItem[] = [
    { to: '/app', label: 'Resumen operativo', shortLabel: 'RO', end: true },
  ];

  if (user.role === 'platform_admin') {
    navItems.push({
      to: '/app/platform/organizations',
      label: 'Entidades y planes',
      shortLabel: 'EP',
    });
  }

  if (user.organizationId) {
    navItems.push(
      { to: '/app/events', label: 'Eventos y talleres', shortLabel: 'EV' },
      { to: '/app/certificates', label: 'Certificados', shortLabel: 'CE' },
      { to: '/app/inventory', label: 'Inventario QR', shortLabel: 'IN' },
      { to: '/app/loans', label: 'Préstamos y mora', shortLabel: 'PR' },
      { to: '/app/reports', label: 'Estadísticas y reportes', shortLabel: 'RE' },
      { to: '/app/people', label: 'Participantes', shortLabel: 'PA' },
      { to: '/app/notifications', label: 'Notificaciones', shortLabel: 'NO' },
      { to: '/app/organization', label: 'Mi entidad', shortLabel: 'ME' },
      { to: '/app/sites', label: 'Sedes y puntos QR', shortLabel: 'SQ' },
    );
    if (user.role === 'org_admin') {
      navItems.push({ to: '/app/users', label: 'Usuarios y roles', shortLabel: 'UR' });
    }
  }

  navItems.push(
    { to: '/app/profile', label: 'Mi perfil y clave', shortLabel: 'MP' },
    { to: '/design-system', label: 'Sistema de diseño', shortLabel: 'SD' },
  );

  const handleLogout = async () => {
    await logout();
    void navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-body)] flex">
      {/* Barra lateral izquierda colapsable (240 px expandida, 64 px colapsada) */}
      <aside
        aria-label="Navegación principal del panel"
        className={`shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col justify-between transition-[width] duration-150 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div>
          <div className="h-16 px-4 border-b border-[var(--border)] flex items-center justify-between gap-2">
            {!collapsed ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--action)] text-[var(--action-text)] font-mono text-xs font-semibold">
                  T
                </span>
                <div className="truncate">
                  <p className="text-sm font-medium text-[var(--text-heading)] leading-tight">
                    Tap
                  </p>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {organization?.name ?? 'Administración central'}
                  </p>
                </div>
              </div>
            ) : (
              <span className="mx-auto inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] bg-[var(--action)] text-[var(--action-text)] font-mono text-xs font-semibold">
                T
              </span>
            )}
          </div>

          <nav className="p-2 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-[var(--radius-control)] text-sm transition-colors ${
                    isActive
                      ? 'bg-[var(--accent-wash)] text-[var(--text-heading)] font-medium'
                      : 'text-[var(--text-body)] hover:bg-[var(--surface-hover)]'
                  }`
                }
              >
                <span className="font-mono text-xs text-[var(--text-muted)] w-5 text-center shrink-0">
                  {item.shortLabel}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="p-3 border-t border-[var(--border)]">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          >
            <span className="font-mono text-xs">{collapsed ? '»' : '«'}</span>
            {!collapsed && <span className="ml-2">Compactar menú</span>}
          </Button>
        </div>
      </aside>

      {/* Área derecha: barra superior + contenedor de trabajo */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 px-6 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-medium text-[var(--text-heading)] truncate">
              {organization ? organization.name : 'Consola de Plataforma Tap'}
            </span>
            {organization && (
              <Badge status="info">
                Plan{' '}
                {organization.plan === 'institutional'
                  ? 'Institucional'
                  : organization.plan === 'standard'
                    ? 'Estándar'
                    : 'Piloto'}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggle />
            <div className="hidden sm:flex flex-col items-end text-right">
              <span
                className="text-sm font-medium text-[var(--text-heading)] leading-tight"
                data-testid="header-user-name"
              >
                {user.fullName}
              </span>
              <span className="text-xs text-[var(--text-muted)]">{ROLE_LABELS[user.role]}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleLogout()}
              data-testid="logout-button"
            >
              Cerrar sesión
            </Button>
          </div>
        </header>

        <main className="flex-1 px-6 py-8 lg:px-8">
          <div className="mx-auto max-w-[1280px]">
            <Outlet context={{ organization, setOrganization: setFetchedOrganization }} />
          </div>
        </main>
      </div>
    </div>
  );
}
