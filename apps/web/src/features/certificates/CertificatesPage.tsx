import type {
  CertificateDto,
  CertificateTemplateDto,
  EvaluateEventCertificatesResponse,
  EventDto,
  IssueEventCertificatesResponse,
} from '@tap/contracts';
import { Award, CheckCircle2, Download, ExternalLink, FileText, Mail, ShieldX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiClientError, apiDownloadFile, apiRequest } from '../../shared/api/http-client.ts';
import { Badge, Button, Card, Input, StatCard } from '../../shared/ui/index.ts';

export function CertificatesPage() {
  const { id: routeEventId } = useParams<{ id?: string }>();

  const [activeTab, setActiveTab] = useState<'events' | 'templates'>('events');
  const [events, setEvents] = useState<EventDto[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>(routeEventId ?? '');
  const [templates, setTemplates] = useState<CertificateTemplateDto[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [hoursInput, setHoursInput] = useState<string>('4');

  const [evaluation, setEvaluation] = useState<EvaluateEventCertificatesResponse | null>(null);
  const [certificates, setCertificates] = useState<CertificateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estado del formulario de plantillas
  const [tplTitle, setTplTitle] = useState('Certificado de Participación');
  const [tplBody, setTplBody] = useState(
    'Certifica que {{full_name}} participó activamente en la actividad institucional «{{event_name}}», realizada el {{date}}, con una intensidad horaria de {{hours}} hora(s).',
  );
  const [tplSignerName, setTplSignerName] = useState('Dirección de Bienestar Institucional');
  const [tplSignerRole, setTplSignerRole] = useState('Coordinación General');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Modal de revocación
  const [revokeTarget, setRevokeTarget] = useState<CertificateDto | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [submittingRevoke, setSubmittingRevoke] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [eventList, templateList] = await Promise.all([
          apiRequest<EventDto[]>('/events'),
          apiRequest<CertificateTemplateDto[]>('/certificate-templates'),
        ]);
        if (!active) return;
        setEvents(eventList);
        setTemplates(templateList);

        const defaultTpl = templateList.find((t) => t.isDefault) ?? templateList[0];
        if (defaultTpl && !selectedTemplateId) {
          setSelectedTemplateId(defaultTpl.id);
        }

        const effectiveEventId = routeEventId || selectedEventId || eventList[0]?.id || '';
        if (effectiveEventId) {
          if (!selectedEventId) {
            setSelectedEventId(effectiveEventId);
          }
          const [evalRes, certList] = await Promise.all([
            apiRequest<EvaluateEventCertificatesResponse>(
              `/events/${effectiveEventId}/certificates/evaluate`,
              { method: 'POST' },
            ),
            apiRequest<CertificateDto[]>(`/events/${effectiveEventId}/certificates`),
          ]);
          if (active) {
            setEvaluation(evalRes);
            setCertificates(certList);
          }
        }
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof ApiClientError
              ? err.detail
              : 'No fue posible cargar la información de certificados.',
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
  }, [routeEventId, selectedEventId, selectedTemplateId, reloadKey]);

  const handleIssueBatch = async () => {
    if (!selectedEventId) return;
    setIssuing(true);
    setFeedback(null);
    setErrorMessage(null);
    try {
      const res = await apiRequest<IssueEventCertificatesResponse>(
        `/events/${selectedEventId}/certificates/issue`,
        {
          method: 'POST',
          body: {
            templateId: selectedTemplateId || undefined,
            hours: hoursInput.trim() || '4',
          },
        },
      );
      setFeedback(
        `Emisión completada: ${res.issuedCount} nuevo(s), ${res.skippedAlreadyIssuedCount} ya emitido(s) omitido(s) por idempotencia.`,
      );
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudieron emitir los certificados.',
      );
    } finally {
      setIssuing(false);
    }
  };

  const handleDownloadPdf = async (cert: CertificateDto) => {
    try {
      await apiDownloadFile(`/certificates/${cert.id}/pdf`, `certificado_${cert.code}.pdf`);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudo descargar el PDF del certificado.',
      );
    }
  };

  const handleResendEmail = async (cert: CertificateDto) => {
    setFeedback(null);
    setErrorMessage(null);
    try {
      await apiRequest<CertificateDto>(`/certificates/${cert.id}/resend`, {
        method: 'POST',
      });
      setFeedback(`Correo de notificación reenviado para el certificado ${cert.code}.`);
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudo reenviar la notificación.',
      );
    }
  };

  const handleConfirmRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeTarget || revokeReason.trim().length < 5) return;
    setSubmittingRevoke(true);
    setErrorMessage(null);
    try {
      await apiRequest<CertificateDto>(`/certificates/${revokeTarget.id}/revoke`, {
        method: 'POST',
        body: { reason: revokeReason.trim() },
      });
      setFeedback(`Certificado ${revokeTarget.code} revocado y registrado en auditoría.`);
      setRevokeTarget(null);
      setRevokeReason('');
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No fue posible revocar el certificado.',
      );
    } finally {
      setSubmittingRevoke(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTemplate(true);
    setErrorMessage(null);
    try {
      const created = await apiRequest<CertificateTemplateDto>('/certificate-templates', {
        method: 'POST',
        body: {
          title: tplTitle.trim(),
          bodyTemplate: tplBody.trim(),
          signers: [{ name: tplSignerName.trim(), role: tplSignerRole.trim() }],
          orientation: 'landscape',
          isDefault: true,
        },
      });
      setSelectedTemplateId(created.id);
      setFeedback(
        `Plantilla «${created.title}» (v${created.version}) guardada como predeterminada.`,
      );
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudo guardar la plantilla.',
      );
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-normal text-[var(--text-heading)]">
            Certificados de participación
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Evaluación de elegibilidad, emisión en lote idempotente, descarga PDF con QR y
            revocación auditada.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={activeTab === 'events' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('events')}
            data-testid="tab-certificates-events"
          >
            <Award className="h-4 w-4" aria-hidden="true" />
            Emisión por evento
          </Button>
          <Button
            type="button"
            variant={activeTab === 'templates' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('templates')}
            data-testid="tab-certificates-templates"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Plantillas ({templates.length})
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-xs text-[var(--status-danger-text)]"
        >
          {errorMessage}
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className="rounded-[var(--radius-control)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-xs text-[var(--status-success-text)]"
          data-testid="certificates-feedback-banner"
        >
          {feedback}
        </div>
      )}

      {loading ? (
        <Card title="Cargando módulo de certificados…">
          <p className="text-sm text-[var(--text-muted)]">Consultando eventos y plantillas…</p>
        </Card>
      ) : activeTab === 'events' ? (
        <div className="space-y-6">
          <Card
            title="Selección de evento y parámetros de emisión"
            description="Elige el evento para evaluar quiénes cumplen la regla de asistencia y emitir certificados sin duplicados."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4 items-end">
              <div className="md:col-span-2">
                <label
                  htmlFor="cert-event-select"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-body)]"
                >
                  Evento o actividad
                </label>
                <select
                  id="cert-event-select"
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-heading)]"
                  data-testid="cert-event-select"
                >
                  {events.length === 0 && <option value="">Sin eventos creados</option>}
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name} ({ev.publicCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Input
                  id="cert-hours-input"
                  label="Intensidad horaria (horas)"
                  value={hoursInput}
                  onChange={(e) => setHoursInput(e.target.value)}
                  data-testid="cert-hours-input"
                />
              </div>

              <div>
                {/* Única acción cromática principal por vista (AGENTS.md A9) */}
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  disabled={issuing || !selectedEventId || (evaluation?.eligibleCount ?? 0) === 0}
                  onClick={() => void handleIssueBatch()}
                  data-testid="issue-certificates-btn"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {issuing ? 'Emitiendo…' : 'Emitir certificados en lote'}
                </Button>
              </div>
            </div>
          </Card>

          {evaluation && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <StatCard
                  label="Asistentes evaluados"
                  value={String(evaluation.totalEvaluated)}
                  hint={evaluation.ruleSummary}
                />
                <StatCard
                  label="Elegibles para certificado"
                  value={String(evaluation.eligibleCount)}
                  hint="Cumplen la regla de asistencia"
                />
                <StatCard
                  label="No elegibles"
                  value={String(evaluation.ineligibleCount)}
                  hint="No alcanzan el umbral mínimo"
                />
                <StatCard
                  label="Certificados activos emitidos"
                  value={String(certificates.filter((c) => c.status === 'issued').length)}
                  hint="Con código único y PDF verificable"
                />
              </div>

              <Card
                title={`Certificados del evento (${certificates.length})`}
                description="Cada certificado cuenta con código único de 12 caracteres, PDF con QR verificable en /v/:code y registro de entrega por correo."
              >
                {certificates.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Aún no se han emitido certificados para este evento. Haz clic en «Emitir
                    certificados en lote» para generarlos.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table
                      className="w-full text-left text-xs border-collapse"
                      data-testid="certificates-table"
                    >
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                          <th className="py-2.5 pr-3 font-medium">Código</th>
                          <th className="py-2.5 px-3 font-medium">Titular</th>
                          <th className="py-2.5 px-3 font-medium">Estado</th>
                          <th className="py-2.5 px-3 font-medium">Correo</th>
                          <th className="py-2.5 px-3 font-medium">Verificaciones</th>
                          <th className="py-2.5 pl-3 text-right font-medium">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {certificates.map((cert) => (
                          <tr
                            key={cert.id}
                            data-testid={`certificate-row-${cert.code}`}
                            className="hover:bg-[var(--surface-hover)]"
                          >
                            <td className="py-2.5 pr-3 font-mono text-[var(--text-heading)]">
                              {cert.code}
                            </td>
                            <td className="py-2.5 px-3">
                              <p className="font-medium text-[var(--text-heading)]">
                                {cert.holderName}
                              </p>
                              <p className="font-mono text-[11px] text-[var(--text-muted)]">
                                {cert.maskedDocument}
                              </p>
                            </td>
                            <td className="py-2.5 px-3">
                              {cert.status === 'issued' ? (
                                <Badge status="success">Emitido</Badge>
                              ) : (
                                <Badge status="danger">Revocado</Badge>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-[var(--text-body)]">
                              {cert.deliveredAt ? (
                                <Badge status="info">Enviado</Badge>
                              ) : cert.recipientEmail ? (
                                <span className="text-[var(--text-muted)]">Pendiente</span>
                              ) : (
                                <span className="text-[var(--text-muted)]">Sin correo</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--text-heading)]">
                              {cert.verificationCount}
                            </td>
                            <td className="py-2.5 pl-3 text-right">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleDownloadPdf(cert)}
                                  data-testid={`download-cert-pdf-${cert.code}`}
                                >
                                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                  PDF
                                </Button>
                                <Link
                                  to={`/v/${cert.code}`}
                                  className="inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-heading)] hover:bg-[var(--surface-hover)]"
                                  data-testid={`verify-cert-link-${cert.code}`}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                  Verificar
                                </Link>
                                {cert.status === 'issued' && cert.recipientEmail && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleResendEmail(cert)}
                                    data-testid={`resend-cert-btn-${cert.code}`}
                                  >
                                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                                    Reenviar
                                  </Button>
                                )}
                                {cert.status === 'issued' && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setRevokeTarget(cert);
                                      setRevokeReason('');
                                    }}
                                    data-testid={`revoke-cert-btn-${cert.code}`}
                                  >
                                    <ShieldX className="h-3.5 w-3.5" aria-hidden="true" />
                                    Revocar
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card
                title="Detalle de elegibilidad por participante"
                description={`Regla aplicada: ${evaluation.ruleSummary}`}
              >
                {evaluation.totalEvaluated === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Este evento aún no registra asistentes válidos para evaluar.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                          <th className="py-2 pr-3 font-medium">Participante</th>
                          <th className="py-2 px-3 font-medium">Sesiones</th>
                          <th className="py-2 px-3 font-medium">Porcentaje</th>
                          <th className="py-2 px-3 font-medium">Resultado</th>
                          <th className="py-2 pl-3 font-medium">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {[...evaluation.eligible, ...evaluation.ineligible].map((item) => (
                          <tr key={item.personId}>
                            <td className="py-2 pr-3">
                              <span className="font-medium text-[var(--text-heading)]">
                                {item.fullName}
                              </span>{' '}
                              <span className="font-mono text-[var(--text-muted)]">
                                ({item.maskedDocument})
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums">
                              {item.attendedSessions} / {item.totalSessions}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums">
                              {item.attendancePercent}%
                            </td>
                            <td className="py-2 px-3">
                              {item.eligible ? (
                                <Badge status="success">Elegible</Badge>
                              ) : (
                                <Badge status="warning">No elegible</Badge>
                              )}
                            </td>
                            <td className="py-2 pl-3 text-[var(--text-body)]">{item.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card
            title="Crear nueva versión de plantilla"
            description="Usa las variables {{full_name}}, {{event_name}}, {{date}} y {{hours}}."
          >
            <form onSubmit={(e) => void handleCreateTemplate(e)} className="space-y-4">
              <Input
                id="tpl-title"
                label="Título del certificado"
                value={tplTitle}
                onChange={(e) => setTplTitle(e.target.value)}
                required
              />
              <div>
                <label
                  htmlFor="tpl-body"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-body)]"
                >
                  Cuerpo del certificado
                </label>
                <textarea
                  id="tpl-body"
                  rows={4}
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text-heading)]"
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  id="tpl-signer-name"
                  label="Nombre del firmante"
                  value={tplSignerName}
                  onChange={(e) => setTplSignerName(e.target.value)}
                  required
                />
                <Input
                  id="tpl-signer-role"
                  label="Cargo del firmante"
                  value={tplSignerRole}
                  onChange={(e) => setTplSignerRole(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" variant="primary" disabled={savingTemplate}>
                {savingTemplate ? 'Guardando…' : 'Guardar plantilla predeterminada'}
              </Button>
            </form>
          </Card>

          <Card
            title="Plantillas disponibles"
            description="Cada certificado conserva una instantánea inmutable de la plantilla con la que fue emitido."
          >
            <div className="space-y-3">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--text-heading)]">{tpl.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge status={tpl.isDefault ? 'success' : 'neutral'}>
                        v{tpl.version} {tpl.isDefault ? '· Predeterminada' : ''}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-body)]">{tpl.bodyTemplate}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {revokeTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
            <h2 className="text-base font-medium text-[var(--text-heading)]">
              Revocar certificado {revokeTarget.code}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Titular: <strong>{revokeTarget.holderName}</strong>. Al revocarlo, la página pública{' '}
              <code>/v/{revokeTarget.code}</code> mostrará inmediatamente que el certificado fue
              revocado junto con el motivo.
            </p>
            <form onSubmit={(e) => void handleConfirmRevoke(e)} className="space-y-4">
              <Input
                id="revoke-reason-input"
                label="Motivo de la revocación (mínimo 5 caracteres)"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Ej: Error en registro de asistencia verificado en acta"
                data-testid="revoke-reason-input"
                required
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRevokeTarget(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  className="border-[var(--status-danger-border)] text-[var(--status-danger-text)] hover:bg-[var(--status-danger-bg)]"
                  disabled={submittingRevoke || revokeReason.trim().length < 5}
                  data-testid="confirm-revoke-btn"
                >
                  {submittingRevoke ? 'Revocando…' : 'Confirmar revocación'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
