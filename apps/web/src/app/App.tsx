import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
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
import { AuthProvider, useAuth } from '../shared/auth/auth-context.tsx';
import { DesignSystemShowcasePage } from './DesignSystemShowcasePage.tsx';
import { StaffLayout } from './layouts/StaffLayout.tsx';
import { ThemeProvider } from '../shared/theme/ThemeProvider.tsx';

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

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
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
