import type { GoogleAuthUrlResponse, OrganizationType, ServiceModulePlan } from '@tap/contracts';
import { ArrowLeft, Check, Megaphone, Package, QrCode, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { ApiClientError, apiRequest, isDemoModeActive } from '../../shared/api/http-client.ts';
import { useAuth } from '../../shared/auth/auth-context.tsx';
import { Badge, Button, Card, Input, TapLogo, ThemeToggle } from '../../shared/ui/index.ts';

const ORGANIZATION_TYPES: ReadonlyArray<{ value: OrganizationType; label: string }> = [
  { value: 'institucion_educativa', label: 'Institución educativa' },
  { value: 'ente_deportivo', label: 'Ente deportivo municipal' },
  { value: 'caja', label: 'Caja de compensación' },
  { value: 'gimnasio', label: 'Gimnasio o centro deportivo' },
  { value: 'empresa', label: 'Empresa u organización' },
  { value: 'otro', label: 'Otro' },
];

const SERVICE_PLANS: ReadonlyArray<{
  id: ServiceModulePlan;
  title: string;
  badge: string;
  summary: string;
  includes: ReadonlyArray<string>;
  excludes: string;
}> = [
  {
    id: 'attendance_only',
    title: 'Solo asistencia + certificados',
    badge: 'Opción 1',
    summary:
      'Registra asistentes en segundos con QR de evento o cámara móvil en quiosco, y emite certificados PDF verificables.',
    includes: [
      'Check-in público sin cuenta (/c/:code)',
      'Modo quiosco con cámara trasera móvil',
      'Certificados PDF con QR de verificación',
      'Reportes y estadísticas descargables',
    ],
    excludes: 'No incluye inventario ni envío de publicidad.',
  },
  {
    id: 'inventory_only',
    title: 'Solo inventario y préstamos',
    badge: 'Opción 2',
    summary:
      'Administra implementos con etiquetas QR, préstamos con firma digital desde el celular y alertas automáticas de mora.',
    includes: [
      'Catálogo y etiquetas QR imprimibles',
      'Solicitud pública con firma táctil (/p/:code)',
      'Devolución rápida escaneando QR con celular',
      'Control de mora y reportes descargables',
    ],
    excludes: 'No incluye eventos, certificados ni publicidad.',
  },
  {
    id: 'certificates_marketing',
    title: 'Certificados + envío de publicidad',
    badge: 'Opción 3',
    summary:
      'Emite y envía certificados verificables y promociona nuevos eventos a quienes autorizaron publicidad (Ley 2300).',
    includes: [
      'Eventos, asistencia y emisión de certificados',
      'Casilla opcional de publicidad (Ley 2300)',
      'Campañas por correo para nuevos eventos',
      'Gestión de consentimientos y bajas',
    ],
    excludes: 'No incluye módulo de inventario ni préstamos.',
  },
];

export function RegisterPage() {
  const { isAuthenticated, isLoading, register } = useAuth();
  const navigate = useNavigate();

  const [organizationName, setOrganizationName] = useState('');
  const [organizationType, setOrganizationType] =
    useState<OrganizationType>('institucion_educativa');
  const [servicePlan, setServicePlan] = useState<ServiceModulePlan>('attendance_only');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (organizationName.trim().length < 2) {
      setErrorMessage('Escribe el nombre de tu entidad u organización.');
      return;
    }
    if (adminFullName.trim().length < 2) {
      setErrorMessage('Escribe el nombre completo del responsable.');
      return;
    }
    if (!adminEmail.trim()) {
      setErrorMessage('Ingresa un correo institucional válido.');
      return;
    }
    if (adminPassword.length < 12) {
      setErrorMessage('La contraseña debe tener al menos 12 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        organizationName: organizationName.trim(),
        organizationType,
        servicePlan,
        adminFullName: adminFullName.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
      });
      void navigate('/app', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('No fue posible completar el registro. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleRegister = async () => {
    setErrorMessage(null);
    if (organizationName.trim().length < 2) {
      setErrorMessage('Primero escribe el nombre de tu entidad u organización.');
      return;
    }

    if (isDemoModeActive()) {
      setSubmitting(true);
      try {
        await register({
          organizationName: organizationName.trim(),
          organizationType,
          servicePlan,
          adminFullName: adminFullName.trim() || 'Coordinación Google Demo',
          adminEmail: adminEmail.trim() || 'google.demo@entidad.tap',
          adminPassword: 'DemoGoogleOAuthPassword2026!',
        });
        void navigate('/app', { replace: true });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const qs = new URLSearchParams({
        mode: 'register',
        organizationName: organizationName.trim(),
        organizationType,
        servicePlan,
      });
      const res = await apiRequest<GoogleAuthUrlResponse>(`/auth/google?${qs.toString()}`, {
        method: 'GET',
        skipAuthRefresh: true,
      });
      window.location.assign(res.authorizationUrl);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError
          ? err.detail
          : 'El registro con Google no está configurado en este servidor.',
      );
    }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-body)] flex flex-col justify-between px-4 py-6 sm:px-6 sm:py-8">
      <header className="mx-auto w-full max-w-[1280px] flex items-center justify-between gap-3">
        <TapLogo size="md" subtitle="Registro de nueva entidad" />
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--link)] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Ya tengo cuenta
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl my-6 sm:my-10">
        <Card padding="lg">
          <div className="mb-6">
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">
              Panel de suscripción · Servicio exclusivo
            </p>
            <h1 className="text-2xl sm:text-3xl font-light text-[var(--text-heading)] tracking-tight">
              Registra tu entidad y adquiere un servicio
            </h1>
            <p className="mt-2 text-sm text-[var(--text-body)]">
              Elige una de las tres opciones disponibles para tu entidad:{' '}
              <strong className="font-medium text-[var(--text-heading)]">
                asistencia + certificados
              </strong>
              ,{' '}
              <strong className="font-medium text-[var(--text-heading)]">
                inventario y préstamos
              </strong>{' '}
              o{' '}
              <strong className="font-medium text-[var(--text-heading)]">
                certificados + envío de publicidad
              </strong>
              .
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              data-testid="register-error"
              className="mb-5 rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-sm text-[var(--status-danger-text)]"
            >
              {errorMessage}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6" noValidate>
            {/* Paso 1: Selección excluyente de servicio */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-[var(--text-heading)]">
                1. Selecciona el servicio que deseas adquirir (solo uno)
              </legend>

              <div
                role="radiogroup"
                aria-label="Servicio a adquirir"
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                {SERVICE_PLANS.map((plan) => {
                  const selected = servicePlan === plan.id;
                  const Icon =
                    plan.id === 'attendance_only'
                      ? Users
                      : plan.id === 'inventory_only'
                        ? Package
                        : Megaphone;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-testid={`service-plan-${plan.id}`}
                      onClick={() => setServicePlan(plan.id)}
                      className={[
                        'text-left rounded-[var(--radius-card)] border p-4 transition-colors flex flex-col justify-between gap-3',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                        selected
                          ? 'border-[var(--action)] bg-[var(--accent-wash)]'
                          : 'border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)]',
                      ].join(' ')}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-heading)]">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <Badge status={selected ? 'info' : 'neutral'}>{plan.badge}</Badge>
                        </div>

                        <div>
                          <p className="text-sm font-medium text-[var(--text-heading)]">
                            {plan.title}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-body)] leading-relaxed">
                            {plan.summary}
                          </p>
                        </div>

                        <ul className="space-y-1.5 pt-1">
                          {plan.includes.map((item) => (
                            <li
                              key={item}
                              className="flex items-start gap-2 text-xs text-[var(--text-body)]"
                            >
                              <Check
                                className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--text-heading)]"
                                aria-hidden="true"
                              />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {plan.excludes}
                        </span>
                        <span className="font-mono text-xs font-medium text-[var(--text-heading)] shrink-0">
                          {selected ? 'Seleccionado' : 'Elegir'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Paso 2: Datos de la entidad */}
            <div className="space-y-4 pt-2 border-t border-[var(--border)]">
              <p className="text-sm font-medium text-[var(--text-heading)]">
                2. Datos de la entidad y administrador inicial
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nombre de la entidad"
                  name="organizationName"
                  placeholder="Ej: Bienestar Universitario UCEVA"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                />

                <div className="space-y-1.5">
                  <label
                    htmlFor="organization-type-select"
                    className="block text-sm font-normal text-[var(--text-heading)]"
                  >
                    Tipo de entidad
                  </label>
                  <select
                    id="organization-type-select"
                    value={organizationType}
                    onChange={(e) => setOrganizationType(e.target.value as OrganizationType)}
                    className="w-full min-h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    {ORGANIZATION_TYPES.map((typeOption) => (
                      <option key={typeOption.value} value={typeOption.value}>
                        {typeOption.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nombre del administrador"
                  name="adminFullName"
                  autoComplete="name"
                  placeholder="Ej: Laura Gómez"
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  required
                />

                <Input
                  label="Correo institucional"
                  type="email"
                  name="adminEmail"
                  autoComplete="email"
                  placeholder="coordinacion@entidad.edu.co"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                />
              </div>

              <Input
                label="Contraseña de acceso"
                type="password"
                name="adminPassword"
                autoComplete="new-password"
                placeholder="Mínimo 12 caracteres (sin usar tu correo)"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
              />
            </div>

            {/* Única acción cromática principal de la vista (AGENTS.md A9) */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <QrCode className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Se creará tu sede principal con punto QR listo para usar.</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => void handleGoogleRegister()}
                  className="w-full sm:w-auto"
                  data-testid="register-google-btn"
                >
                  Registrar con Google
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitting}
                  className="w-full sm:w-auto"
                  data-testid="register-submit"
                >
                  {submitting ? 'Creando entidad…' : 'Crear entidad y adquirir servicio'}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </main>

      <footer className="mx-auto w-full max-w-[1280px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
        <span>Tap — Plataforma multi-entidad para eventos masivos y préstamo de implementos.</span>
        <span>Tratamiento de datos conforme a la Ley 1581 de 2012.</span>
      </footer>
    </div>
  );
}
