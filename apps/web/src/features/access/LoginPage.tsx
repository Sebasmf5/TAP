import type { GoogleAuthUrlResponse } from '@tap/contracts';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { useAuth } from '../../shared/auth/auth-context.tsx';
import { Button, Card, Input, ThemeToggle } from '../../shared/ui/index.ts';

export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Ingresa tu correo institucional y tu contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      void navigate('/app', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('No fue posible conectar con el servidor. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    try {
      const res = await apiRequest<GoogleAuthUrlResponse>('/auth/google', {
        method: 'GET',
        skipAuthRefresh: true,
      });
      window.location.assign(res.authorizationUrl);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('El inicio de sesión con Google no está disponible en este momento.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-body)] flex flex-col justify-between px-6 py-8">
      <header className="mx-auto w-full max-w-[1280px] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] bg-[var(--action)] text-[var(--action-text)] font-mono text-sm font-semibold">
            T
          </span>
          <div>
            <span className="text-base font-medium text-[var(--text-heading)]">Tap</span>
            <span className="ml-2 text-xs text-[var(--text-muted)]">
              Asistencia, certificados y préstamos
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/design-system"
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-heading)]"
          >
            Sistema de diseño
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md my-auto py-8">
        <Card padding="lg">
          <div className="mb-6">
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">
              Acceso de funcionarios
            </p>
            <h1 className="text-2xl font-light text-[var(--text-heading)] tracking-tight">
              Inicia sesión en tu entidad
            </h1>
            <p className="mt-1.5 text-sm text-[var(--text-body)]">
              Los participantes y estudiantes no necesitan cuenta para registrar asistencia ni
              solicitar implementos.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              data-testid="login-error"
              className="mb-5 rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-sm text-[var(--status-danger-text)]"
            >
              {errorMessage}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
            <Input
              label="Correo institucional"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="coordinacion@entidad.edu.co"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Contraseña"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Mínimo 12 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {/* Única acción cromática principal de la vista (AGENTS.md A9) */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={submitting}
                data-testid="login-submit"
              >
                {submitting ? 'Verificando credenciales…' : 'Iniciar sesión'}
              </Button>
            </div>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-muted)]">o con cuenta institucional</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void handleGoogleLogin()}
          >
            Continuar con Google
          </Button>
        </Card>
      </main>

      <footer className="mx-auto w-full max-w-[1280px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
        <span>Tap — Plataforma multi-entidad para eventos masivos y préstamo de implementos.</span>
        <span>Tratamiento de datos conforme a la Ley 1581 de 2012.</span>
      </footer>
    </div>
  );
}
