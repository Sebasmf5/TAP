import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { DashboardHomePage, LoginPage, ProfilePage, UsersPage } from '../features/access/index.ts';
import { EventsPage } from '../features/events/index.ts';
import {
  OrganizationSettingsPage,
  PlatformOrganizationsPage,
  SitesPage,
} from '../features/organizations/index.ts';
import { PeoplePage } from '../features/people/index.ts';
import { AuthProvider, useAuth } from '../shared/auth/auth-context.tsx';
import { DesignSystemShowcasePage } from './DesignSystemShowcasePage.tsx';
import { StaffLayout } from './layouts/StaffLayout.tsx';
import { ThemeProvider } from './theme/ThemeProvider.tsx';

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
