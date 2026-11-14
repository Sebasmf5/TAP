import type { ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { DashboardHomePage, LoginPage, ProfilePage, UsersPage } from '../features/access/index.ts';
import { EventAttendancePage, PublicCheckinPage } from '../features/attendance/index.ts';
import { CertificatesPage, PublicCertificateVerifyPage } from '../features/certificates/index.ts';
import { EventsPage } from '../features/events/index.ts';
import { InventoryPage } from '../features/inventory/index.ts';
import { LoansPage, PublicLoanRequestPage } from '../features/loans/index.ts';
import { NotificationsPage } from '../features/notifications/index.ts';
import {
  OrganizationSettingsPage,
  PlatformOrganizationsPage,
  SitesPage,
} from '../features/organizations/index.ts';
import { PeoplePage } from '../features/people/index.ts';
import { ReportsPage } from '../features/reports/index.ts';
import { enableDemoMode, isDemoModeActive } from '../shared/api/http-client.ts';
import { AuthProvider, useAuth } from '../shared/auth/auth-context.tsx';
import { ThemeProvider } from '../shared/theme/ThemeProvider.tsx';
import { DesignSystemShowcasePage } from './DesignSystemShowcasePage.tsx';
import { StaffLayout } from './layouts/StaffLayout.tsx';

function RecruiterDemoBanner() {
  const location = useLocation();
  const { isAuthenticated, login } = useAuth();
  if (!isDemoModeActive() && !location.search.includes('demo=1')) {
    return null;
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2 text-xs text-[var(--text-body)]">
      <div className="mx-auto max-w-[1280px] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--action)]" />
          <span className="font-mono font-medium text-[var(--text-heading)]">
            MODO DEMOSTRACIÓN INTERACTIVO
          </span>
          <span className="hidden sm:inline text-[var(--text-muted)]">
            — Navega entre el panel administrativo y las vistas públicas sin servidor
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono">
          <Link
            to="/app/events"
            onClick={() => {
              enableDemoMode(true);
              if (!isAuthenticated) {
                void login({ email: 'admin@demo.tap', password: 'demo-portfolio-access' });
              }
            }}
            className="text-[var(--link)] hover:underline"
          >
            Panel Admin
          </Link>
          <span className="text-[var(--text-muted)]">·</span>
          <Link to="/c/FERIA1" className="text-[var(--link)] hover:underline">
            Check-in (/c/FERIA1)
          </Link>
          <span className="text-[var(--text-muted)]">·</span>
          <Link to="/p/PREST1" className="text-[var(--link)] hover:underline">
            Préstamo (/p/PREST1)
          </Link>
          <span className="text-[var(--text-muted)]">·</span>
          <Link to="/v/TAP-2026-DEMO01" className="text-[var(--link)] hover:underline">
            Verificar Diploma
          </Link>
          <span className="text-[var(--text-muted)]">·</span>
          <Link to="/app/reports" className="text-[var(--link)] hover:underline">
            Reportes
          </Link>
        </div>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { readonly children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-body)] flex items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">Verificando sesión…</p>
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter basename={routerBasename}>
          <RecruiterDemoBanner />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/c/:code" element={<PublicCheckinPage />} />
            <Route path="/p/:code" element={<PublicLoanRequestPage />} />
            <Route path="/v/:code" element={<PublicCertificateVerifyPage />} />
            <Route path="/design-system" element={<DesignSystemShowcasePage />} />
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <StaffLayout />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardHomePage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="events/:id/attendance" element={<EventAttendancePage />} />
              <Route path="events/:id/certificates" element={<CertificatesPage />} />
              <Route path="certificates" element={<CertificatesPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="loans" element={<LoansPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="people" element={<PeoplePage />} />
              <Route path="organization" element={<OrganizationSettingsPage />} />
              <Route path="sites" element={<SitesPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="platform/organizations" element={<PlatformOrganizationsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
