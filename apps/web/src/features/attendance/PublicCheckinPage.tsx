import type {
  DocumentType,
  PersonType,
  PublicCheckinEventInfo,
  PublicCheckinLookupResponse,
  PublicCheckinSubmitResponse,
} from '@tap/contracts';
import { CheckCircle2, Clock, MapPin, ShieldCheck, UserCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { Badge, Button, Card } from '../../shared/ui/index.ts';

function formatBogotaDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function PublicCheckinPage() {
  const { code } = useParams<{ code: string }>();
  const [info, setInfo] = useState<PublicCheckinEventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [identificationMode, setIdentificationMode] = useState<'document' | 'institutional_code'>(
    'document',
  );
  const [documentType, setDocumentType] = useState<DocumentType>('CC');
  const [identifier, setIdentifier] = useState('');

  // Paso de confirmación (`confirm_identity = true`)
  const [lookupResult, setLookupResult] = useState<PublicCheckinLookupResponse | null>(null);

  // Paso de alta rápida (`needs_registration` cuando `allow_walk_in = true`)
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [walkInFullName, setWalkInFullName] = useState('');
  const [walkInInstitutionalCode, setWalkInInstitutionalCode] = useState('');
  const [walkInEmail, setWalkInEmail] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInPersonType, setWalkInPersonType] = useState<PersonType>('student');
  const [walkInIsMinor, setWalkInIsMinor] = useState(false);
  const [walkInGuardianName, setWalkInGuardianName] = useState('');
  const [walkInGuardianPhone, setWalkInGuardianPhone] = useState('');
  const [acceptedConsent, setAcceptedConsent] = useState(false);

  // Resultado final
  const [submitResult, setSubmitResult] = useState<PublicCheckinSubmitResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Medición de tiempo en cliente (`client_duration_ms`, indicador del piloto B2.1)
  const interactionStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!code) return;
    let active = true;

    void (async () => {
      try {
        const data = await apiRequest<PublicCheckinEventInfo>(
          `/public/checkin/${encodeURIComponent(code)}`,
          { skipAuthRefresh: true },
        );
        if (!active) return;
        setInfo(data);
        const allowed = data.event.allowedIdentificationModes;
        if (!allowed.includes('document') && allowed.includes('institutional_code')) {
          setIdentificationMode('institutional_code');
        }
        setLoadError(null);
      } catch (err) {
        if (!active) return;
        setLoadError(
          err instanceof ApiClientError
            ? err.detail
            : 'No fue posible cargar la información del evento.',
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [code]);

  const markInteractionStart = () => {
    if (interactionStartedAtRef.current === null) {
      interactionStartedAtRef.current = Math.round(performance.now());
    }
  };

  const computeClientDurationMs = (): number | undefined => {
    if (interactionStartedAtRef.current === null) return undefined;
    const elapsed = Math.round(performance.now()) - interactionStartedAtRef.current;
    return Math.max(0, Math.min(elapsed, 600_000));
  };

  const handlePrimarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !info) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      // Si el evento pide confirmar identidad y aún no hemos consultado `lookup` ni estamos en walk-in:
      if (info.event.confirmIdentity && !lookupResult && !showWalkInForm) {
        const lookup = await apiRequest<PublicCheckinLookupResponse>(
          `/public/checkin/${encodeURIComponent(code)}/lookup`,
          {
            method: 'POST',
            skipAuthRefresh: true,
            body: {
              identificationMode,
              identifier: identifier.trim(),
              documentType: identificationMode === 'document' ? documentType : undefined,
            },
          },
        );

        if (lookup.found) {
          setLookupResult(lookup);
          setSubmitting(false);
          return;
        }

        if (lookup.allowWalkIn) {
          setShowWalkInForm(true);
          setSubmitting(false);
          return;
        }
      }

      const response = await apiRequest<PublicCheckinSubmitResponse>(
        `/public/checkin/${encodeURIComponent(code)}`,
        {
          method: 'POST',
          skipAuthRefresh: true,
          body: {
            identificationMode,
            identifier: identifier.trim(),
            documentType: identificationMode === 'document' ? documentType : undefined,
            sessionId: info.event.activeSession.id,
            clientDurationMs: computeClientDurationMs(),
            walkInRegistration: showWalkInForm
              ? {
                  documentType,
                  documentNumber: identifier.trim(),
                  fullName: walkInFullName.trim(),
                  institutionalCode: walkInInstitutionalCode.trim() || null,
                  email: walkInEmail.trim() || null,
                  phone: walkInPhone.trim() || null,
                  personType: walkInPersonType,
                  isMinor: walkInIsMinor,
                  guardianName: walkInIsMinor ? walkInGuardianName.trim() : null,
                  guardianPhone: walkInIsMinor ? walkInGuardianPhone.trim() : null,
                  acceptedDataConsent: true as const,
                }
              : undefined,
          },
        },
      );

      if (response.outcome === 'needs_registration') {
        setShowWalkInForm(true);
        setLookupResult(null);
      } else {
        setSubmitResult(response);
      }
    } catch (err) {
      setSubmitError(
        err instanceof ApiClientError
          ? err.detail
          : 'No pudimos registrar tu asistencia. Verifica tus datos e intenta de nuevo.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetForAnotherPerson = () => {
    setIdentifier('');
    setLookupResult(null);
    setShowWalkInForm(false);
    setWalkInFullName('');
    setWalkInInstitutionalCode('');
    setWalkInEmail('');
    setWalkInPhone('');
    setWalkInIsMinor(false);
    setWalkInGuardianName('');
    setWalkInGuardianPhone('');
    setAcceptedConsent(false);
    setSubmitResult(null);
    setSubmitError(null);
    interactionStartedAtRef.current = null;
  };

  return (
    /* Tema claro (Stripe) predeterminado para el participante (AGENTS.md A9) */
    <div
      data-theme="light"
      className="min-h-screen bg-[var(--canvas)] text-[var(--text-body)] px-4 py-8 flex flex-col items-center justify-center"
    >
      <div className="w-full max-w-[440px] space-y-6">
        {/* Encabezado institucional sobrio */}
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] bg-[var(--action)] text-[var(--action-text)] font-mono text-sm font-semibold">
              T
            </span>
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
                {info?.organization.name ?? 'Tap — Registro de asistencia'}
              </p>
              <p className="text-sm font-medium text-[var(--text-heading)]">
                Toma de asistencia rápida
              </p>
            </div>
          </div>
          {info && (
            <span className="font-mono text-xs text-[var(--text-muted)] bg-[var(--surface-raised)] border border-[var(--border)] px-2 py-1 rounded-[var(--radius-control)]">
              {info.event.publicCode}
            </span>
          )}
        </header>

        {loading ? (
          <Card title="Cargando evento…">
            <p className="text-sm text-[var(--text-muted)]">
              Consultando datos de la sesión activa…
            </p>
          </Card>
        ) : loadError || !info ? (
          <Card title="Evento no disponible">
            <p className="text-sm text-[var(--text-body)]" role="alert">
              {loadError ?? 'No encontramos un evento asociado a este código QR.'}
            </p>
          </Card>
        ) : (
          <>
            {/* Ficha del evento */}
            <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h1
                  className="text-xl font-normal text-[var(--text-heading)] leading-snug"
                  data-testid="public-event-title"
                >
                  {info.event.name}
                </h1>
                <Badge status={info.event.status === 'open' ? 'success' : 'warning'}>
                  {info.event.status === 'open' ? 'Abierto' : info.event.status}
                </Badge>
              </div>

              {info.event.description && (
                <p className="text-sm text-[var(--text-body)]">{info.event.description}</p>
              )}

              <div className="pt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {info.event.activeSession.label}
                </span>
                {info.event.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {info.event.location}
                  </span>
                )}
              </div>
            </section>

            {/* Estado cuando el evento no está abierto */}
            {info.event.status !== 'open' ? (
              <Card title="Registro fuera de horario">
                <p className="text-sm text-[var(--text-body)]">
                  Este evento no tiene la recepción de asistencia abierta en este momento.
                </p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Ventana programada: {formatBogotaDateTime(info.event.checkinOpensAt)} —{' '}
                  {formatBogotaDateTime(info.event.checkinClosesAt)}
                </p>
              </Card>
            ) : submitResult ? (
              /* Pantalla de éxito / idempotencia */
              <section
                className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4"
                data-testid="checkin-confirmation-card"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2
                    className="h-7 w-7 shrink-0 text-[var(--status-success-text)]"
                    aria-hidden="true"
                  />
                  <div>
                    <Badge
                      status={submitResult.outcome === 'registered' ? 'success' : 'info'}
                      data-testid="checkin-outcome-badge"
                    >
                      {submitResult.outcome === 'registered'
                        ? 'Asistencia registrada'
                        : 'Asistencia ya registrada'}
                    </Badge>
                    <h2 className="mt-1 text-lg font-medium text-[var(--text-heading)]">
                      {submitResult.maskedName ?? 'Participante verificado'}
                    </h2>
                  </div>
                </div>

                <p className="text-sm text-[var(--text-body)]">{submitResult.message}</p>

                <dl className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-muted)]">Documento:</dt>
                    <dd className="font-mono text-[var(--text-heading)]">
                      {submitResult.maskedDocument}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-muted)]">Sesión:</dt>
                    <dd className="text-[var(--text-heading)]">{submitResult.sessionLabel}</dd>
                  </div>
                  {submitResult.checkedInAt && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--text-muted)]">Hora oficial (Bogotá):</dt>
                      <dd className="font-mono tabular-nums text-[var(--text-heading)]">
                        {formatBogotaDateTime(submitResult.checkedInAt)}
                      </dd>
                    </div>
                  )}
                </dl>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12"
                  onClick={resetForAnotherPerson}
                  data-testid="checkin-reset-btn"
                >
                  Registrar otra persona en este dispositivo
                </Button>
              </section>
            ) : (
              /* Formulario principal de check-in */
              <form
                onSubmit={(e) => void handlePrimarySubmit(e)}
                className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4"
              >
                {submitError && (
                  <div
                    role="alert"
                    className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2.5 text-xs text-[var(--status-danger-text)]"
                  >
                    {submitError}
                  </div>
                )}

                {/* Selector de modo si el evento admite tanto documento como código institucional */}
                {info.event.allowedIdentificationModes.includes('document') &&
                  info.event.allowedIdentificationModes.includes('institutional_code') &&
                  !lookupResult &&
                  !showWalkInForm && (
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-[var(--radius-control)] bg-[var(--surface-raised)] border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => setIdentificationMode('document')}
                        className={`py-2 text-xs font-medium rounded-[var(--radius-control)] transition-colors ${
                          identificationMode === 'document'
                            ? 'bg-[var(--surface)] text-[var(--text-heading)] border border-[var(--border)]'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        Por documento
                      </button>
                      <button
                        type="button"
                        onClick={() => setIdentificationMode('institutional_code')}
                        className={`py-2 text-xs font-medium rounded-[var(--radius-control)] transition-colors ${
                          identificationMode === 'institutional_code'
                            ? 'bg-[var(--surface)] text-[var(--text-heading)] border border-[var(--border)]'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        Código estudiantil
                      </button>
                    </div>
                  )}

                {!lookupResult ? (
                  <div className="space-y-3">
                    {identificationMode === 'document' && (
                      <div>
                        <label
                          htmlFor="checkin-doc-type"
                          className="block text-xs font-medium text-[var(--text-heading)] mb-1"
                        >
                          Tipo de documento
                        </label>
                        <select
                          id="checkin-doc-type"
                          value={documentType}
                          onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                          disabled={showWalkInForm}
                          className="w-full h-12 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-heading)]"
                        >
                          <option value="CC">Cédula de ciudadanía (CC)</option>
                          <option value="TI">Tarjeta de identidad (TI)</option>
                          <option value="CE">Cédula de extranjería (CE)</option>
                          <option value="PAS">Pasaporte (PAS)</option>
                          <option value="OTHER">Otro documento</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="checkin-identifier-input"
                        className="block text-xs font-medium text-[var(--text-heading)] mb-1"
                      >
                        {identificationMode === 'document'
                          ? 'Número de documento (sin puntos)'
                          : 'Código estudiantil o institucional'}
                      </label>
                      <input
                        id="checkin-identifier-input"
                        data-testid="checkin-identifier-input"
                        type="text"
                        inputMode={identificationMode === 'document' ? 'numeric' : 'text'}
                        autoComplete="off"
                        required
                        minLength={3}
                        value={identifier}
                        onFocus={markInteractionStart}
                        onChange={(e) => {
                          markInteractionStart();
                          setIdentifier(e.target.value);
                        }}
                        placeholder={
                          identificationMode === 'document' ? 'Ej. 1116234567' : 'Ej. 20261001'
                        }
                        className="w-full h-12 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3.5 font-mono text-base text-[var(--text-heading)] focus:outline-2 focus:outline-[var(--focus-ring)]"
                      />
                    </div>
                  </div>
                ) : (
                  /* Confirmación de identidad abreviada («Juan P.») según AGENTS.md A7.2 */
                  <div
                    className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 space-y-2"
                    data-testid="checkin-lookup-confirm-box"
                  >
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <UserCheck className="h-4 w-4 text-[var(--action)]" aria-hidden="true" />
                      <span>Verifica tu identidad antes de confirmar</span>
                    </div>
                    <p className="text-lg font-medium text-[var(--text-heading)]">
                      {lookupResult.maskedName}
                    </p>
                    <p className="text-xs font-mono text-[var(--text-muted)]">
                      Documento: {lookupResult.maskedDocument}
                    </p>
                  </div>
                )}

                {/* Campos adicionales cuando la persona es nueva y el evento permite `allow_walk_in` */}
                {showWalkInForm && (
                  <div
                    className="pt-2 border-t border-[var(--border)] space-y-3"
                    data-testid="checkin-walkin-section"
                  >
                    <p className="text-xs text-[var(--text-muted)]">
                      Es tu primera vez en esta entidad. Completa tus datos básicos para quedar
                      registrado:
                    </p>

                    <div>
                      <label
                        htmlFor="walkin-fullname"
                        className="block text-xs font-medium text-[var(--text-heading)] mb-1"
                      >
                        Nombre y apellidos completos
                      </label>
                      <input
                        id="walkin-fullname"
                        data-testid="walkin-fullname-input"
                        type="text"
                        required
                        minLength={3}
                        value={walkInFullName}
                        onChange={(e) => setWalkInFullName(e.target.value)}
                        placeholder="Ej. Laura Sofía Andrade"
                        className="w-full h-12 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-heading)]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="walkin-code"
                          className="block text-xs font-medium text-[var(--text-heading)] mb-1"
                        >
                          Código institucional (opcional)
                        </label>
                        <input
                          id="walkin-code"
                          type="text"
                          value={walkInInstitutionalCode}
                          onChange={(e) => setWalkInInstitutionalCode(e.target.value)}
                          placeholder="Ej. 20261099"
                          className="w-full h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 font-mono text-sm text-[var(--text-heading)]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="walkin-person-type"
                          className="block text-xs font-medium text-[var(--text-heading)] mb-1"
                        >
                          Vinculación
                        </label>
                        <select
                          id="walkin-person-type"
                          value={walkInPersonType}
                          onChange={(e) => setWalkInPersonType(e.target.value as PersonType)}
                          className="w-full h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-heading)]"
                        >
                          <option value="student">Estudiante</option>
                          <option value="teacher">Docente</option>
                          <option value="staff">Administrativo / Funcionario</option>
                          <option value="affiliate">Afiliado</option>
                          <option value="external">Visitante externo</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="walkin-email"
                        className="block text-xs font-medium text-[var(--text-heading)] mb-1"
                      >
                        Correo electrónico (opcional, para certificados)
                      </label>
                      <input
                        id="walkin-email"
                        type="email"
                        value={walkInEmail}
                        onChange={(e) => setWalkInEmail(e.target.value)}
                        placeholder="nombre@correo.edu.co"
                        className="w-full h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-heading)]"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-[var(--text-heading)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={walkInIsMinor}
                        onChange={(e) => setWalkInIsMinor(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Soy menor de 18 años (requiere datos del acudiente)
                    </label>

                    {walkInIsMinor && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3">
                        <div>
                          <label
                            htmlFor="walkin-guardian-name"
                            className="block text-xs font-medium text-[var(--text-heading)] mb-1"
                          >
                            Nombre del acudiente
                          </label>
                          <input
                            id="walkin-guardian-name"
                            type="text"
                            required
                            minLength={3}
                            value={walkInGuardianName}
                            onChange={(e) => setWalkInGuardianName(e.target.value)}
                            className="w-full h-10 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="walkin-guardian-phone"
                            className="block text-xs font-medium text-[var(--text-heading)] mb-1"
                          >
                            Teléfono del acudiente
                          </label>
                          <input
                            id="walkin-guardian-phone"
                            type="tel"
                            required
                            minLength={5}
                            value={walkInGuardianPhone}
                            onChange={(e) => setWalkInGuardianPhone(e.target.value)}
                            className="w-full h-10 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {/* Autorización de tratamiento de datos Ley 1581 que bloquea el envío hasta aceptarla */}
                    <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--text-heading)] inline-flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Autorización Ley 1581 de 2012
                        </span>
                        <span className="font-mono text-[var(--text-muted)]">
                          {info.organization.dataConsentVersion}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-body)] leading-relaxed">
                        {info.organization.dataConsentText}
                      </p>
                      <label className="flex items-start gap-2.5 pt-1 text-xs font-medium text-[var(--text-heading)] cursor-pointer">
                        <input
                          type="checkbox"
                          data-testid="walkin-consent-checkbox"
                          checked={acceptedConsent}
                          onChange={(e) => setAcceptedConsent(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <span>
                          Acepto de manera previa, expresa e informada el tratamiento de mis datos
                          personales.
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Única acción cromática principal de la vista (AGENTS.md A9) */}
                <div className="pt-1 space-y-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full h-12 text-sm font-medium"
                    disabled={submitting || (showWalkInForm && !acceptedConsent)}
                    data-testid="checkin-submit-btn"
                  >
                    {submitting
                      ? 'Procesando…'
                      : lookupResult
                        ? 'Sí, registrar mi asistencia'
                        : showWalkInForm
                          ? 'Guardar datos y registrar asistencia'
                          : 'Registrar mi asistencia'}
                  </Button>

                  {(lookupResult || showWalkInForm) && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11 text-xs"
                      onClick={() => {
                        setLookupResult(null);
                        setShowWalkInForm(false);
                        setSubmitError(null);
                      }}
                    >
                      Corregir número de documento
                    </Button>
                  )}
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
