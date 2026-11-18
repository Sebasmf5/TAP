import type { GoogleAuthUrlResponse } from '@tap/contracts';
import { ArrowRight, CheckCircle2, Package, QrCode, ShieldCheck, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { ApiClientError, apiRequest, enableDemoMode } from '../../shared/api/http-client.ts';
import { useAuth } from '../../shared/auth/auth-context.tsx';
import {
  Badge,
  Button,
  Card,
  Input,
  QrScannerModal,
  TapHeroIllustration,
  ThemeToggle,
  resolveTapInternalPath,
} from '../../shared/ui/index.ts';

export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

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

  const handleQrDetected = (decoded: string) => {
    setScannerOpen(false);
    const internalPath = resolveTapInternalPath(decoded);
    if (internalPath) {
      enableDemoMode(false);
      void navigate(internalPath);
      return;
    }
    setScanMessage(
      `Código leído (${decoded.trim()}). Si corresponde a un evento o punto de préstamo, abre su enlace /c/ o /p/.`,
    );
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-body)] flex flex-col justify-between px-4 py-6 sm:px-6 sm:py-8">
      <header className="mx-auto w-full max-w-[1280px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--action)] text-[var(--action-text)] font-mono text-sm font-semibold">
            T
          </span>
          <div className="truncate">
            <span className="text-base font-medium text-[var(--text-heading)]">Tap</span>
            <span className="hidden sm:inline ml-2 text-xs text-[var(--text-muted)]">
              Asistencia, certificados y préstamos
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setScanMessage(null);
              setScannerOpen(true);
            }}
            data-testid="public-qr-scanner-btn"
          >
            <QrCode className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Escanear QR</span>
          </Button>
          <Link
            to="/register"
            className="hidden sm:inline-flex text-xs font-medium text-[var(--link)] hover:underline"
          >
            Registrar entidad
          </Link>
          <Link
            to="/design-system"
            className="hidden md:inline-flex text-xs text-[var(--text-muted)] hover:text-[var(--text-heading)]"
          >
            Sistema de diseño
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] my-auto py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Columna de presentación y servicios excluyentes */}
          <section className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1 text-xs font-mono text-[var(--text-heading)]">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--action)]" aria-hidden="true" />
                <span>Web móvil sin apps · Multi-entidad · Ley 1581</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-light text-[var(--text-heading)] tracking-tight leading-tight">
                Control ágil de asistencia masiva o inventario QR en un solo lugar.
              </h1>

              <p className="text-sm sm:text-base text-[var(--text-body)] max-w-2xl leading-relaxed">
                Registra tu entidad eligiendo el servicio que necesitas:{' '}
                <strong className="font-medium text-[var(--text-heading)]">
                  asistencia rápida y certificados
                </strong>{' '}
                o{' '}
                <strong className="font-medium text-[var(--text-heading)]">
                  inventario y préstamos con firma digital
                </strong>
                . Los participantes escanean el QR desde su celular sin crear cuentas.
              </p>
            </div>

            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-4 pt-3 pb-1 overflow-hidden">
              <TapHeroIllustration className="w-full max-w-[460px] mx-auto h-auto" />
            </div>

            {scanMessage && (
              <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--accent-wash)] px-4 py-3 text-xs text-[var(--text-heading)] font-mono">
                {scanMessage}
              </div>
            )}

            {/* Tarjetas de los 2 servicios especializados */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accent-wash)] text-[var(--text-heading)]">
                    <Users className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <Badge status="info">Servicio 1</Badge>
                </div>
                <div>
                  <h2 className="text-base font-medium text-[var(--text-heading)]">
                    Asistencia rápida
                  </h2>
                  <p className="mt-1 text-xs text-[var(--text-body)] leading-relaxed">
                    Check-in masivo por QR en segundos, modo quiosco con cámara móvil y emisión
                    automática de certificados PDF verificables.
                  </p>
                </div>
              </div>

              <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accent-wash)] text-[var(--text-heading)]">
                    <Package className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <Badge status="info">Servicio 2</Badge>
                </div>
                <div>
                  <h2 className="text-base font-medium text-[var(--text-heading)]">
                    Inventarios y préstamos
                  </h2>
                  <p className="mt-1 text-xs text-[var(--text-body)] leading-relaxed">
                    Etiquetas QR imprimibles, solicitud desde celular con firma táctil, devolución
                    por escaneo y alertas automáticas de mora.
                  </p>
                </div>
              </div>
            </div>

            {/* Acciones rápidas de registro y escaneo móvil */}
            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--text-heading)]">
                  ¿Tu entidad aún no tiene cuenta?
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Crea tu organización y adquiere asistencia rápida o inventarios en menos de 1
                  minuto.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                <Link to="/register" data-testid="go-to-register-link">
                  <Button type="button" variant="secondary" className="w-full sm:w-auto">
                    Registrar entidad
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          {/* Columna derecha: tarjeta de acceso */}
          <section className="lg:col-span-5 w-full max-w-md mx-auto lg:max-w-none">
            <Card padding="lg">
              <div className="mb-5">
                <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Acceso de funcionarios
                </p>
                <h2 className="text-2xl font-light text-[var(--text-heading)] tracking-tight">
                  Inicia sesión en tu entidad
                </h2>
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void handleGoogleLogin()}
                >
                  Continuar con Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setScannerOpen(true)}
                >
                  <QrCode className="h-4 w-4" aria-hidden="true" />
                  Escanear QR
                </Button>
              </div>

              {/* Acceso directo interactivo para reclutadores / demostración */}
              <div className="mt-6 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
                      Vista de portafolio / Reclutadores
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-body)]">
                      Explora el prototipo con datos interactivos en 1 clic.
                    </p>
                  </div>
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  data-testid="recruiter-demo-btn"
                  onClick={() => {
                    enableDemoMode(true);
                    void login({
                      email: 'admin@demo.tap',
                      password: 'demo-portfolio-access',
                    }).then(() => {
                      void navigate('/app', { replace: true });
                    });
                  }}
                >
                  Entrar al Panel Administrativo (1 clic)
                </Button>

                <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <Link
                    to="/c/FERIA1"
                    onClick={() => enableDemoMode(false)}
                    className="font-mono text-[var(--link)] hover:underline"
                  >
                    → Check-in QR (/c/FERIA1)
                  </Link>
                  <Link
                    to="/p/PREST1"
                    onClick={() => enableDemoMode(false)}
                    className="font-mono text-[var(--link)] hover:underline"
                  >
                    → Préstamo (/p/PREST1)
                  </Link>
                  <Link
                    to="/v/TAP-2026-DEMO01"
                    onClick={() => enableDemoMode(false)}
                    className="font-mono text-[var(--link)] hover:underline"
                  >
                    → Verificar Diploma
                  </Link>
                </div>
              </div>
            </Card>
          </section>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-[1280px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[var(--text-muted)] pt-4 border-t border-[var(--border)]">
        <span>Tap — Plataforma multi-entidad para eventos masivos y préstamo de implementos.</span>
        <span>Tratamiento de datos conforme a la Ley 1581 de 2012.</span>
      </footer>

      <QrScannerModal
        open={scannerOpen}
        title="Escanear código QR"
        description="Apunta la cámara de tu celular al QR de un evento (/c/), punto de préstamo (/p/) o certificado (/v/)."
        onClose={() => setScannerOpen(false)}
        onDetected={handleQrDetected}
      />
    </div>
  );
}
