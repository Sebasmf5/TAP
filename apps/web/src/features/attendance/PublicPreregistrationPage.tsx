import type {
  DocumentType,
  PersonType,
  PublicCheckinEventInfo,
  PublicPreregistrationResponse,
} from '@tap/contracts';
import { Calendar, CheckCircle2, MailCheck, MapPin, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { Badge, Button, Card, TapLogo } from '../../shared/ui/index.ts';

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

export function PublicPreregistrationPage() {
  const { code } = useParams<{ code: string }>();
  const [info, setInfo] = useState<PublicCheckinEventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [documentType, setDocumentType] = useState<DocumentType>('CC');
  const [documentNumber, setDocumentNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [institutionalCode, setInstitutionalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [personType, setPersonType] = useState<PersonType>('student');
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [acceptedConsent, setAcceptedConsent] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicPreregistrationResponse | null>(null);

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!code) return;
    setSubmitError(null);

    if (documentNumber.trim().length < 4) {
      setSubmitError('Escribe tu número de documento (mínimo 4 caracteres).');
      return;
    }
    if (fullName.trim().length < 3) {
      setSubmitError('Escribe tu nombre completo.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setSubmitError('Ingresa un correo electrónico válido para enviarte la confirmación.');
      return;
    }
    if (!acceptedConsent) {
      setSubmitError('Debes aceptar la autorización de tratamiento de datos para preregistrarte.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<PublicPreregistrationResponse>(
        `/public/preregister/${encodeURIComponent(code)}`,
        {
          method: 'POST',
          skipAuthRefresh: true,
          body: {
            documentType,
            documentNumber: documentNumber.trim(),
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            institutionalCode: institutionalCode.trim() || null,
            phone: phone.trim() || null,
            personType,
            isMinor,
            guardianName: isMinor ? guardianName.trim() || null : null,
            guardianPhone: isMinor ? guardianPhone.trim() || null : null,
            acceptedDataConsent: true,
            marketingOptIn,
          },
        },
      );
      setResult(res);
    } catch (err) {
      setSubmitError(
        err instanceof ApiClientError
          ? err.detail
          : 'No se pudo completar el preregistro. Inténtalo de nuevo.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-body)] px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-[480px] space-y-5">
        <header className="flex items-center justify-between gap-3">
          <TapLogo size="sm" subtitle={info?.organization.name ?? 'Preregistro de evento'} />
          <Badge status="info">Preregistro</Badge>
        </header>

        {loading && (
          <Card padding="lg">
            <p className="text-sm text-[var(--text-muted)]">Cargando información del evento…</p>
          </Card>
        )}

        {!loading && loadError && (
          <Card padding="lg">
            <p className="text-sm text-[var(--status-danger-text)]">{loadError}</p>
          </Card>
        )}

        {!loading && info && !result && (
          <>
            <Card padding="lg" className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  {info.organization.name}
                </p>
                <h1 className="text-2xl font-light text-[var(--text-heading)] tracking-tight">
                  {info.event.name}
                </h1>
              </div>

              {info.event.description && (
                <p className="text-sm text-[var(--text-body)] leading-relaxed">
                  {info.event.description}
                </p>
              )}

              <div className="pt-2 space-y-1.5 text-xs text-[var(--text-muted)]">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Inicio: {formatBogotaDateTime(info.event.startsAt)}</span>
                </div>
                {info.event.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{info.event.location}</span>
                  </div>
                )}
              </div>
            </Card>

            <Card padding="lg">
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
                <div>
                  <h2 className="text-lg font-medium text-[var(--text-heading)]">
                    Completa tu preregistro
                  </h2>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Te enviaremos la confirmación y tu código personal de ingreso por correo.
                  </p>
                </div>

                {submitError && (
                  <div
                    role="alert"
                    className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-sm text-[var(--status-danger-text)]"
                  >
                    {submitError}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label
                      htmlFor="prereg-doc-type"
                      className="block text-xs font-medium text-[var(--text-heading)] mb-1.5"
                    >
                      Tipo
                    </label>
                    <select
                      id="prereg-doc-type"
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                      className="h-12 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-base text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      <option value="CC">CC</option>
                      <option value="TI">TI</option>
                      <option value="CE">CE</option>
                      <option value="PASSPORT">Pasaporte</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label
                      htmlFor="prereg-doc-number"
                      className="block text-xs font-medium text-[var(--text-heading)] mb-1.5"
                    >
                      Número de documento
                    </label>
                    <input
                      id="prereg-doc-number"
                      type="text"
                      inputMode="numeric"
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      placeholder="Ej. 1002345678"
                      required
                      className="h-12 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-base font-mono text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="prereg-full-name"
                    className="block text-xs font-medium text-[var(--text-heading)] mb-1.5"
                  >
                    Nombre completo
                  </label>
                  <input
                    id="prereg-full-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ej. María Camila Pérez"
                    required
                    className="h-12 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-base text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prereg-email"
                    className="block text-xs font-medium text-[var(--text-heading)] mb-1.5"
                  >
                    Correo electrónico (para recibir tu confirmación)
                  </label>
                  <input
                    id="prereg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@correo.edu.co"
                    required
                    className="h-12 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-base text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="prereg-code"
                      className="block text-xs font-medium text-[var(--text-heading)] mb-1.5"
                    >
                      Código estudiantil (opcional)
                    </label>
                    <input
                      id="prereg-code"
                      type="text"
                      value={institutionalCode}
                      onChange={(e) => setInstitutionalCode(e.target.value)}
                      placeholder="Ej. 20261045"
                      className="h-12 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-base font-mono text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prereg-person-type"
                      className="block text-xs font-medium text-[var(--text-heading)] mb-1.5"
                    >
                      Vinculación
                    </label>
                    <select
                      id="prereg-person-type"
                      value={personType}
                      onChange={(e) => setPersonType(e.target.value as PersonType)}
                      className="h-12 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-base text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      <option value="student">Estudiante</option>
                      <option value="staff">Funcionario / Docente</option>
                      <option value="external">Externo / Invitado</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="prereg-phone"
                    className="block text-xs font-medium text-[var(--text-heading)] mb-1.5"
                  >
                    Celular (opcional)
                  </label>
                  <input
                    id="prereg-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="300 000 0000"
                    className="h-12 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-base text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  />
                </div>

                <label className="flex items-start gap-2.5 text-xs text-[var(--text-body)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMinor}
                    onChange={(e) => setIsMinor(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)]"
                  />
                  <span>Soy menor de edad (requiere datos del acudiente)</span>
                </label>

                {isMinor && (
                  <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3">
                    <input
                      type="text"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="Nombre completo del acudiente"
                      className="h-12 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-base text-[var(--text-heading)]"
                    />
                    <input
                      type="tel"
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value)}
                      placeholder="Teléfono del acudiente"
                      className="h-12 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-base text-[var(--text-heading)]"
                    />
                  </div>
                )}

                <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3.5 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-heading)]">
                    <ShieldCheck className="h-4 w-4 text-[var(--action)]" aria-hidden="true" />
                    <span>Autorización de datos (v{info.organization.dataConsentVersion})</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {info.organization.dataConsentText}
                  </p>
                  <label className="flex items-start gap-2.5 text-xs text-[var(--text-heading)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptedConsent}
                      onChange={(e) => setAcceptedConsent(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)]"
                      required
                    />
                    <span>
                      Acepto el tratamiento de mis datos personales para este preregistro.
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 text-xs text-[var(--text-body)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marketingOptIn}
                      onChange={(e) => setMarketingOptIn(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)]"
                    />
                    <span>
                      Autorizo recibir invitaciones a futuros eventos de {info.organization.name}{' '}
                      (Ley 2300 de 2023, opcional).
                    </span>
                  </label>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full h-12 text-base"
                  disabled={submitting || !acceptedConsent}
                  data-testid="preregister-submit"
                >
                  {submitting ? 'Enviando preregistro…' : 'Confirmar preregistro'}
                </Button>
              </form>
            </Card>
          </>
        )}

        {result && (
          <Card padding="lg" className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-text)]">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-[var(--status-success-text)]">
                  Preregistro exitoso
                </p>
                <h2 className="text-xl font-medium text-[var(--text-heading)]">
                  ¡Listo, {result.maskedName}!
                </h2>
              </div>
            </div>

            <p className="text-sm text-[var(--text-body)] leading-relaxed">{result.message}</p>

            <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3.5 flex items-start gap-2.5 text-xs text-[var(--text-body)]">
              <MailCheck
                className="h-4 w-4 text-[var(--action)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>
                Revisa tu correo <strong>{result.maskedEmail}</strong>. El día del evento puedes
                presentar tu documento o el código personal que enviamos a tu correo.
              </span>
            </div>

            {code && (
              <Link
                to={`/c/${encodeURIComponent(code)}`}
                className="inline-flex text-xs font-medium text-[var(--link)] hover:underline"
              >
                Ir a la pantalla de check-in del evento
              </Link>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
