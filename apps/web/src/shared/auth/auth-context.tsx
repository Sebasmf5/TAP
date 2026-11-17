import type {
  AuthTokenResponse,
  LoginRequest,
  RegisterOrganizationRequest,
  StaffRole,
  UserProfile,
} from '@tap/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  apiRequest,
  refreshAccessTokenSilently,
  setAccessTokenInMemory,
} from '../api/http-client.ts';

export interface AuthContextValue {
  readonly user: UserProfile | null;
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  login(credentials: LoginRequest): Promise<UserProfile>;
  register(input: RegisterOrganizationRequest): Promise<UserProfile>;
  logout(): Promise<void>;
  reloadUser(): Promise<void>;
  hasRole(roles: ReadonlyArray<StaffRole>): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const ROLE_LABELS: Record<StaffRole, string> = {
  platform_admin: 'Administrador de plataforma',
  org_admin: 'Administrador de entidad',
  operator: 'Operador de punto',
  viewer: 'Consulta',
};

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const refreshed = await refreshAccessTokenSilently();
      if (!mounted) return;
      setUser(refreshed ? refreshed.user : null);
      setIsLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (credentials: LoginRequest): Promise<UserProfile> => {
    const res = await apiRequest<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      body: credentials,
      skipAuthRefresh: true,
    });
    setAccessTokenInMemory(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (input: RegisterOrganizationRequest): Promise<UserProfile> => {
    const res = await apiRequest<AuthTokenResponse>('/auth/register', {
      method: 'POST',
      body: input,
      skipAuthRefresh: true,
    });
    setAccessTokenInMemory(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiRequest<null>('/auth/logout', {
        method: 'POST',
        skipAuthRefresh: true,
      });
    } finally {
      setAccessTokenInMemory(null);
      setUser(null);
    }
  }, []);

  const reloadUser = useCallback(async (): Promise<void> => {
    const profile = await apiRequest<UserProfile>('/auth/me');
    setUser(profile);
  }, []);

  const hasRole = useCallback(
    (roles: ReadonlyArray<StaffRole>): boolean => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      reloadUser,
      hasRole,
    }),
    [user, isLoading, login, register, logout, reloadUser, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  }
  return ctx;
}
