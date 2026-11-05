import type {
  DocumentType,
  LoanDto,
  PersonType,
  PublicBorrowerLookupResponse,
  PublicLendingPointInfo,
} from '@tap/contracts';
import { CheckCircle2, Eraser, PenTool, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import SignaturePad from 'signature_pad';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { Badge, Button, Card, Input } from '../../shared/ui/index.ts';

function generateClientIdempotencyKey(): string {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return `loan_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function PublicLoanRequestPage() {
  const { code = '' } = useParams<{ code: string }>();

  const [pointInfo, setPointInfo] = useState<PublicLendingPointInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Paso 1: Bloqueo de formulario hasta aceptar tratamiento de datos (Ley 1581, AGENTS.md A3)
  const [acceptedConsent, setAcceptedConsent] = useState(false);

  // Paso 2: Identificación y lookup
  const [identificationMode, setIdentificationMode] = useState<'document' | 'institutional_code'>(
    'document',
  );
  const [documentType, setDocumentType] = useState<DocumentType>('CC');
  const [identifier, setIdentifier] = useState('');
  const [lookupResult, setLookupResult] = useState<PublicBorrowerLookupResponse | null>(null);
  const [needsWalkIn, setNeedsWalkIn] = useState(false);

  // Datos walk-in si el documento no existe aún
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [personType, setPersonType] = useState<PersonType>('student');

  // Paso 3: Selección de implemento
  const [selectedModelId, setSelectedModelId] = useState('');

  // Paso 4: Firma digital con signature_pad
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [hasSigned, setHasSigned] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateClientIdempotencyKey(),
  );
  const [completedLoan, setCompletedLoan] = useState<LoanDto | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const info = await apiRequest<PublicLendingPointInfo>(
          `/public/lending-points/${encodeURIComponent(code)}`,
          { skipAuthRefresh: true },
        );
        if (active) {
          setPointInfo(info);
          const firstAvailable = info.availableModels.find((m) => m.availableCount > 0);
          if (firstAvailable) {
            setSelectedModelId(firstAvailable.id);
          } else if (info.availableModels[0]) {
            setSelectedModelId(info.availableModels[0].id);
          }
        }
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof ApiClientError
              ? err.detail
              : 'No se pudo cargar la información del punto de préstamo.',
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [code]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || completedLoan) return;

    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(6, 27, 49)',
    });
    const handleEnd = () => {
      setHasSigned(!pad.isEmpty());
    };
    pad.addEventListener('endStroke', handleEnd);
    padRef.current = pad;

    return () => {
      pad.removeEventListener('endStroke', handleEnd);
      pad.off();
    };
  }, [completedLoan, loading]);

  const handleClearSignature = () => {
    padRef.current?.clear();
    setHasSigned(false);
  };

  const handleLookupBorrower = async () => {
    if (!acceptedConsent || identifier.trim().length < 3) return;
    setErrorMessage(null);
    try {
      const res = await apiRequest<PublicBorrowerLookupResponse>(
        `/public/lending-points/${encodeURIComponent(code)}/lookup`,
        {
          method: 'POST',
          skipAuthRefresh: true,
          body: {
            identificationMode,
            identifier: identifier.trim(),
            documentType,
          },
        },
      );
      setLookupResult(res);
      setNeedsWalkIn(!res.found);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'Error al consultar tu identificación.',
      );
    }
  };

  const handleSubmitLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedConsent || !selectedModelId) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const signatureDataUrl =
        padRef.current && !padRef.current.isEmpty()
          ? padRef.current.toDataURL('image/png')
          : hasSigned
            ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
            : '';

      if (!signatureDataUrl) {
        setErrorMessage('Debes firmar en el recuadro antes de confirmar el préstamo.');
        setSubmitting(false);
        return;
      }

      const created = await apiRequest<LoanDto>(
        `/public/lending-points/${encodeURIComponent(code)}/loans`,
        {
          method: 'POST',
          skipAuthRefresh: true,
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
          body: {
            identificationMode,
            identifier: identifier.trim(),
            documentType,
            modelId: selectedModelId,
            acceptedDataConsent: true,
            signatureDataUrl,
            ...(needsWalkIn
              ? {
                  walkInRegistration: {
                    documentType,
                    documentNumber: identifier.trim(),
                    fullName: fullName.trim(),
                    email: email.trim() || null,
                    phone: phone.trim() || null,
                    personType,
                    isMinor: false,
                  },
                }
              : {}),
          },
        },
      );

      setCompletedLoan(created);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError
          ? err.detail
          : 'No fue posible registrar el préstamo. Intenta nuevamente.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-theme="light"
      className="min-h-screen bg-[var(--canvas)] text-[var(--text-body)] px-4 py-8"
    >
      <div className="mx-auto max-w-xl space-y-6">
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--action)] text-[var(--action-text)] font-semibold">
              T
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-heading)]">
                {pointInfo?.organization.name ?? 'Préstamo de Implementos'}
              </p>
              <p
                className="text-xs text-[var(--text-muted)]"
                data-testid="public-lending-point-name"
              >
                {pointInfo?.name ?? `Punto ${code}`}
              </p>
            </div>
          </div>
          <span className="rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1 font-mono text-xs text-[var(--text-heading)]">
            {code.toUpperCase()}
          </span>
        </header>

        {loading ? (
          <Card title="Cargando punto de préstamo…">
            <p className="text-sm text-[var(--text-muted)]">
              Consultando disponibilidad de implementos…
            </p>
          </Card>
        ) : completedLoan ? (
          <section
            className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 space-y-5"
            data-testid="loan-confirmation-card"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="h-7 w-7 shrink-0 text-[var(--status-success-text)]"
                aria-hidden="true"
              />
              <div>
                <Badge status="success" data-testid="loan-status-badge">
                  Préstamo registrado
                </Badge>
                <h1 className="mt-1.5 text-xl font-medium text-[var(--text-heading)]">
                  {completedLoan.modelName} — Unidad {completedLoan.unitCode}
                </h1>
                <p className="text-xs text-[var(--text-muted)]">
                  Prestatario: {completedLoan.borrowerName} ({completedLoan.maskedDocument})
                </p>
              </div>
            </div>

            <dl className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-xs space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Código de unidad asignada:</dt>
                <dd
                  className="font-mono font-semibold text-[var(--text-heading)]"
                  data-testid="loan-assigned-unit-code"
                >
                  {completedLoan.unitCode}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Devolver antes de:</dt>
                <dd className="font-mono tabular-nums text-[var(--text-heading)]">
                  {new Intl.DateTimeFormat('es-CO', {
                    timeZone: 'America/Bogota',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(completedLoan.dueAt))}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Huella SHA-256 de tu firma:</dt>
                <dd className="font-mono text-[11px] text-[var(--text-body)]">
                  {completedLoan.signatureSha256.slice(0, 16)}…
                </dd>
              </div>
            </dl>

            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={() => {
                setCompletedLoan(null);
                setIdempotencyKey(generateClientIdempotencyKey());
                setHasSigned(false);
              }}
            >
              Solicitar otro implemento
            </Button>
          </section>
        ) : (
          <form onSubmit={(e) => void handleSubmitLoan(e)} className="space-y-5">
            {errorMessage && (
              <div
                role="alert"
                className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3.5 text-xs text-[var(--status-danger-text)]"
                data-testid="loan-error-banner"
              >
                {errorMessage}
              </div>
            )}

            {/* Paso 1 obligatorio: Autorización de datos personales Ley 1581 que desbloquea el resto del formulario */}
            <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-heading)]">
                <ShieldCheck className="h-4 w-4 text-[var(--action)]" aria-hidden="true" />
                <span>Paso 1: Autorización de tratamiento de datos (Ley 1581 de 2012)</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {pointInfo?.organization.dataConsentText}
              </p>
              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={acceptedConsent}
                  onChange={(e) => setAcceptedConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--border)]"
                  data-testid="loan-consent-checkbox"
                />
                <span className="text-xs font-medium text-[var(--text-heading)]">
                  Acepto el tratamiento de mis datos personales y me comprometo a devolver el
                  implemento en buen estado ({pointInfo?.organization.dataConsentVersion}).
                </span>
              </label>
            </section>

            {/* El resto del formulario permanece bloqueado (disabled) hasta aceptar el consentimiento */}
            <fieldset
              disabled={!acceptedConsent}
              className="space-y-5 disabled:opacity-60"
              data-testid="loan-form-fieldset"
            >
              <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
                <h2 className="text-sm font-medium text-[var(--text-heading)]">
                  Paso 2: Identifícate
                </h2>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={identificationMode === 'document' ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setIdentificationMode('document')}
                  >
                    Por documento
                  </Button>
                  <Button
                    type="button"
                    variant={identificationMode === 'institutional_code' ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setIdentificationMode('institutional_code')}
                  >
                    Por código estudiantil
                  </Button>
                </div>

                <div className="flex gap-2 items-end">
                  {identificationMode === 'document' && (
                    <div className="w-24">
                      <label
                        htmlFor="loan-doc-type"
                        className="mb-1.5 block text-xs font-medium text-[var(--text-body)]"
                      >
                        Tipo
                      </label>
                      <select
                        id="loan-doc-type"
                        value={documentType}
                        onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                        className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text-heading)]"
                      >
                        <option value="CC">CC</option>
                        <option value="TI">TI</option>
                        <option value="CE">CE</option>
                      </select>
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      id="loan-identifier-input"
                      label={
                        identificationMode === 'document'
                          ? 'Número de documento'
                          : 'Código institucional'
                      }
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Ej: 1116223344"
                      data-testid="loan-identifier-input"
                      required
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleLookupBorrower()}
                    data-testid="loan-lookup-btn"
                  >
                    Verificar
                  </Button>
                </div>

                {lookupResult?.found && (
                  <div
                    className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-xs space-y-1"
                    data-testid="loan-lookup-box"
                  >
                    <p className="font-medium text-[var(--text-heading)]">
                      Identidad verificada: {lookupResult.maskedName} ({lookupResult.maskedDocument}
                      )
                    </p>
                    {!lookupResult.eligible && lookupResult.ineligibilityReason && (
                      <p className="text-[var(--status-danger-text)]">
                        {lookupResult.ineligibilityReason}
                      </p>
                    )}
                  </div>
                )}

                {needsWalkIn && (
                  <div
                    className="space-y-3 border-t border-[var(--border)] pt-3"
                    data-testid="loan-walkin-section"
                  >
                    <p className="text-xs text-[var(--text-muted)]">
                      Completa tus datos por única vez para registrar el préstamo:
                    </p>
                    <Input
                      id="loan-walkin-fullname"
                      label="Nombre y apellidos"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      data-testid="loan-walkin-fullname"
                      required
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        id="loan-walkin-email"
                        type="email"
                        label="Correo institucional o personal"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        data-testid="loan-walkin-email"
                      />
                      <Input
                        id="loan-walkin-phone"
                        label="Celular"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="loan-person-type"
                        className="mb-1.5 block text-xs font-medium text-[var(--text-body)]"
                      >
                        Estamento
                      </label>
                      <select
                        id="loan-person-type"
                        value={personType}
                        onChange={(e) => setPersonType(e.target.value as PersonType)}
                        className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-heading)]"
                      >
                        <option value="student">Estudiante</option>
                        <option value="staff">Docente / Funcionario</option>
                        <option value="external">Invitado</option>
                      </select>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
                <h2 className="text-sm font-medium text-[var(--text-heading)]">
                  Paso 3: Elige el implemento
                </h2>
                <div>
                  <label
                    htmlFor="loan-model-select"
                    className="mb-1.5 block text-xs font-medium text-[var(--text-body)]"
                  >
                    Implemento disponible
                  </label>
                  <select
                    id="loan-model-select"
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-heading)]"
                    data-testid="loan-model-select"
                    required
                  >
                    {pointInfo?.availableModels.map((m) => (
                      <option key={m.id} value={m.id} disabled={m.availableCount === 0}>
                        {m.name} — {m.availableCount} disponible(s) ({m.loanDurationHours}h)
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-heading)]">
                    <PenTool className="h-4 w-4" aria-hidden="true" />
                    <span>Paso 4: Firma digital de responsabilidad</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setHasSigned(true)}
                      data-testid="loan-quick-sign-btn"
                    >
                      Trazar firma
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleClearSignature}
                    >
                      <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                      Limpiar
                    </Button>
                  </div>
                </div>
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={140}
                  className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-white touch-none"
                  data-testid="loan-signature-canvas"
                />
                <p className="text-[11px] text-[var(--text-muted)]">
                  Firma con tu dedo o cursor dentro del recuadro para respaldar el préstamo.
                </p>
              </section>

              {/* Única acción cromática principal por vista (AGENTS.md A9) */}
              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={
                  !acceptedConsent ||
                  submitting ||
                  !identifier.trim() ||
                  !selectedModelId ||
                  lookupResult?.eligible === false
                }
                data-testid="loan-submit-btn"
              >
                {submitting ? 'Procesando préstamo…' : 'Confirmar solicitud de préstamo'}
              </Button>
            </fieldset>
          </form>
        )}
      </div>
    </div>
  );
}
