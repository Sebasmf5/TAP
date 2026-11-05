import type { PublicCertificateVerificationResponse } from '@tap/contracts';
import { Award, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { Badge, Card } from '../../shared/ui/index.ts';

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

export function PublicCertificateVerifyPage() {
  const { code = '' } = useParams<{ code: string }>();
  const [data, setData] = useState<PublicCertificateVerificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await apiRequest<PublicCertificateVerificationResponse>(
          `/public/certificates/verify/${encodeURIComponent(code)}`,
          { skipAuthRefresh: true },
        );
        if (active) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiClientError
              ? err.detail
              : 'No fue posible consultar el estado del certificado en este momento.',
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
                {data?.organizationName ?? 'Verificación Pública de Certificados'}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Consulta oficial de autenticidad y vigencia
              </p>
            </div>
          </div>
          <span
            className="rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1 font-mono text-xs text-[var(--text-heading)]"
            data-testid="verify-certificate-code"
          >
            {code.toUpperCase()}
          </span>
        </header>

        {loading ? (
          <Card title="Verificando certificado…">
            <p className="text-sm text-[var(--text-muted)]">
              Consultando el registro criptográfico del certificado…
            </p>
          </Card>
        ) : error ? (
          <Card title="Error al verificar">
            <p className="text-sm text-[var(--status-danger-text)]">{error}</p>
          </Card>
        ) : !data || !data.found || data.status === 'not_found' ? (
          <section
            className="rounded-[var(--radius-card)] border border-[var(--status-danger-border)] bg-[var(--surface)] p-6 space-y-4"
            data-testid="verify-not-found-card"
          >
            <div className="flex items-start gap-3">
              <XCircle
                className="h-7 w-7 shrink-0 text-[var(--status-danger-text)]"
                aria-hidden="true"
              />
              <div>
                <Badge status="danger" data-testid="verify-status-badge">
                  Certificado no encontrado
                </Badge>
                <h1 className="mt-1.5 text-xl font-medium text-[var(--text-heading)]">
                  El código {code.toUpperCase()} no corresponde a un certificado registrado
                </h1>
              </div>
            </div>
            <p className="text-sm text-[var(--text-body)]">
              Verifica que hayas escrito el código completo de 12 caracteres tal como aparece en la
              esquina inferior derecha del documento PDF.
            </p>
          </section>
        ) : data.status === 'revoked' ? (
          <section
            className="rounded-[var(--radius-card)] border border-[var(--status-danger-border)] bg-[var(--surface)] p-6 space-y-5"
            data-testid="verify-revoked-card"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert
                className="h-7 w-7 shrink-0 text-[var(--status-danger-text)]"
                aria-hidden="true"
              />
              <div>
                <Badge status="danger" data-testid="verify-status-badge">
                  Certificado revocado
                </Badge>
                <h1
                  className="mt-1.5 text-xl font-medium text-[var(--text-heading)]"
                  data-testid="verify-holder-name"
                >
                  {data.holderName}
                </h1>
                <p className="text-sm text-[var(--text-muted)]">{data.eventName}</p>
              </div>
            </div>

            <div
              role="alert"
              className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3.5 text-xs text-[var(--status-danger-text)] space-y-1"
              data-testid="verify-revocation-box"
            >
              <p className="font-medium">Este certificado fue revocado por la entidad emisora.</p>
              {data.revokedReason && <p>Motivo: {data.revokedReason}</p>}
              {data.revokedAt && <p>Fecha de revocación: {formatBogotaDateTime(data.revokedAt)}</p>}
            </div>

            <dl className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-xs space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Entidad emisora:</dt>
                <dd className="text-right font-medium text-[var(--text-heading)]">
                  {data.organizationName}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Actividad:</dt>
                <dd className="text-right text-[var(--text-heading)]">{data.eventName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Código de verificación:</dt>
                <dd className="font-mono text-[var(--text-heading)]">{data.code}</dd>
              </div>
            </dl>
          </section>
        ) : (
          <section
            className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 space-y-5"
            data-testid="verify-valid-card"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="h-7 w-7 shrink-0 text-[var(--status-success-text)]"
                aria-hidden="true"
              />
              <div>
                <Badge status="success" data-testid="verify-status-badge">
                  Certificado auténtico y vigente
                </Badge>
                <h1
                  className="mt-1.5 text-2xl font-normal text-[var(--text-heading)]"
                  data-testid="verify-holder-name"
                >
                  {data.holderName}
                </h1>
                <p className="text-sm text-[var(--text-muted)]">
                  Participación verificada por {data.organizationName}
                </p>
              </div>
            </div>

            <dl className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-xs space-y-2.5">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Evento o actividad:</dt>
                <dd
                  className="text-right font-medium text-[var(--text-heading)]"
                  data-testid="verify-event-name"
                >
                  {data.eventName}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Fecha del evento:</dt>
                <dd className="text-right text-[var(--text-heading)]">{data.eventDate}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Intensidad horaria:</dt>
                <dd className="font-mono tabular-nums text-[var(--text-heading)]">
                  {data.hours} hora(s)
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Entidad emisora:</dt>
                <dd className="text-right text-[var(--text-heading)]">{data.organizationName}</dd>
              </div>
              {data.issuedAt && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Fecha de emisión:</dt>
                  <dd className="font-mono tabular-nums text-[var(--text-heading)]">
                    {formatBogotaDateTime(data.issuedAt)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Código único:</dt>
                <dd className="font-mono text-[var(--text-heading)]">{data.code}</dd>
              </div>
              {data.pdfSha256 && (
                <div className="pt-2 border-t border-[var(--border)]">
                  <dt className="text-[var(--text-muted)] mb-1">Huella SHA-256 del documento:</dt>
                  <dd className="font-mono text-[11px] break-all text-[var(--text-body)]">
                    {data.pdfSha256}
                  </dd>
                </div>
              )}
            </dl>

            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Por protección de datos personales (Ley 1581 de 2012), esta consulta pública no
                expone el número de documento de identidad del titular.
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
