import type { OrganizationDto } from '@tap/contracts';
import { Menu, QrCode, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { apiRequest } from '../../shared/api/http-client.ts';
import { ROLE_LABELS, useAuth } from '../../shared/auth/auth-context.tsx';
import {
  Badge,
  Button,
  QrScannerModal,
  ThemeToggle,
  resolveTapInternalPath,
} from '../../shared/ui/index.ts';

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly end?: boolean;
}

function resolveServiceLabel(org: OrganizationDto): string {
  const hasAttendance = org.features.attendance;
  const hasInventory = org.features.inventory;
  if (hasAttendance && !hasInventory) return 'Asistencia rápida';
  if (hasInventory && !hasAttendance) return 'Inventarios QR';
  return org.plan === 'institutional'
    ? 'Institucional'
    : org.plan === 'standard'
      ? 'Estándar'
      : 'Piloto';
}

export function StaffLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
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
    const features = organization?.features;
    if (!features || features.attendance) {
      navItems.push({ to: '/app/events', label: 'Eventos y talleres', shortLabel: 'EV' });
    }
    if (!features || features.certificates) {
      navItems.push({ to: '/app/certificates', label: 'Certificados', shortLabel: 'CE' });
    }
    if (!features || features.inventory) {
      navItems.push({ to: '/app/inventory', label: 'Inventario QR', shortLabel: 'IN' });
    }
    if (!features || features.loans) {
      navItems.push({ to: '/app/loans', label: 'Préstamos y mora', shortLabel: 'PR' });
    }
    if (!features || features.reports) {
      navItems.push({ to: '/app/reports', label: 'Estadísticas y reportes', shortLabel: 'RE' });
    }
    navItems.push(
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

  const handleGlobalQrDetected = (decoded: string) => {
    setScannerOpen(false);
    const internalPath = resolveTapInternalPath(decoded);
    if (internalPath) {
      void navigate(internalPath);
      return;
    }
    const clean = decoded.trim();
    if (clean.toUpperCase().startsWith('UNIT-') || /^[A-Z]{2,5}-\d{2,5}$/i.test(clean)) {
      void navigate(`/app/loans?returnQr=${encodeURIComponent(clean)}`);
      return;
    }
    setScanNotice(`QR leído: ${clean}`);
  };

  const renderNavLinks = (isMobileDrawer: boolean) => (
    <nav className="p-2 space-y-1">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          title={!isMobileDrawer && collapsed ? item.label : undefined}
          onClick={() => {
            if (isMobileDrawer) setMobileMenuOpen(false);
          }}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-[var(--radius-control)] text-sm transition-colors ${
              isActive
                ? 'bg-[var(--accent-wash)] text-[var(--text-heading)] font-medium'
                : 'text-[var(--text-body)] hover:bg-[var(--surface-hover)]'
            }`
          }
        >
          <span className="font-mono text-xs text-[var(--text-muted)] w-5 text-center shrink-0">
            {item.shortLabel}
          </span>
          {(isMobileDrawer || !collapsed) && <span className="truncate">{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-body)] flex">
      {/* Drawer de navegación móvil (< lg) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[var(--canvas)]/75 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside
            aria-label="Menú de navegación móvil"
            className="relative z-50 w-72 max-w-[85vw] bg-[var(--surface)] border-r border-[var(--border)] flex flex-col justify-between h-full overflow-y-auto"
          >
            <div>
              <div className="h-14 px-4 border-b border-[var(--border)] flex items-center justify-between gap-2">
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Cerrar menú"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              {renderNavLinks(true)}
            </div>

            <div className="p-4 border-t border-[var(--border)] space-y-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-heading)] truncate">
                  {user.fullName}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{ROLE_LABELS[user.role]}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => void handleLogout()}
              >
                Cerrar sesión
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Barra lateral izquierda colapsable en escritorio (>= lg) */}
      <aside
        aria-label="Navegación principal del panel"
        className={`hidden lg:flex shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex-col justify-between transition-[width] duration-150 ${
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

          {renderNavLinks(false)}
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
        <header className="sticky top-0 z-30 h-14 sm:h-16 px-4 sm:px-6 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="lg:hidden px-2"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú de navegación"
              data-testid="mobile-menu-toggle"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>

            <span className="text-sm font-medium text-[var(--text-heading)] truncate">
              {organization ? organization.name : 'Consola de Plataforma Tap'}
            </span>
            {organization && (
              <span className="hidden sm:inline-flex shrink-0">
                <Badge status="info">{resolveServiceLabel(organization)}</Badge>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setScanNotice(null);
                setScannerOpen(true);
              }}
              aria-label="Escanear código QR"
              data-testid="header-qr-scanner-btn"
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Escanear QR</span>
            </Button>

            <ThemeToggle />

            <div className="hidden md:flex flex-col items-end text-right">
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
              className="hidden sm:inline-flex"
              onClick={() => void handleLogout()}
              data-testid="logout-button"
            >
              Cerrar sesión
            </Button>
          </div>
        </header>

        {scanNotice && (
          <div className="border-b border-[var(--border)] bg-[var(--accent-wash)] px-4 sm:px-6 py-2 text-xs text-[var(--text-heading)] flex items-center justify-between gap-2">
            <span className="font-mono truncate">{scanNotice}</span>
            <button
              type="button"
              onClick={() => setScanNotice(null)}
              className="text-[var(--text-muted)] hover:text-[var(--text-heading)]"
            >
              Cerrar
            </button>
          </div>
        )}

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto max-w-[1280px]">
            <Outlet context={{ organization, setOrganization: setFetchedOrganization }} />
          </div>
        </main>
      </div>

      <QrScannerModal
        open={scannerOpen}
        title="Escanear código QR desde móvil"
        description="Escanea un código de evento (/c/), punto de préstamo (/p/), certificado (/v/) o etiqueta de implemento."
        onClose={() => setScannerOpen(false)}
        onDetected={handleGlobalQrDetected}
      />
    </div>
  );
}
