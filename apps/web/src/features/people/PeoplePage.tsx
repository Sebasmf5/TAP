import type { DocumentType, ImportPeopleResponse, PersonDto, PersonType } from '@tap/contracts';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiRequest } from '../../shared/api/http-client.ts';
import { useAuth } from '../../shared/auth/auth-context.tsx';
import { Badge, Button, Card, Input, Table, type TableColumn } from '../../shared/ui/index.ts';

const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  student: 'Estudiante',
  teacher: 'Docente',
  administrative: 'Administrativo',
  external: 'Externo',
  other: 'Otro',
};

const SAMPLE_CSV = [
  'tipo_documento;documento;codigo;nombre_completo;correo;telefono;tipo_persona;es_menor;acudiente_nombre;acudiente_telefono',
  'CC;1116240101;20231010;Juan Camilo Pérez Gómez;juan.perez@uceva.edu.co;3154445566;estudiante;no;;',
  'CC;1116240202;20231011;Valentina Morales Rojas;valentina.morales@uceva.edu.co;3167778899;estudiante;no;;',
  'TI;1099400303;20251012;Santiago Menor Castaño;santiago.castano@uceva.edu.co;3171112233;estudiante;si;Marta Castaño;3105556677',
].join('\n');

export function PeoplePage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'org_admin' || user?.role === 'operator';

  const [people, setPeople] = useState<PersonDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'directory' | 'import'>('directory');

  // Estado formulario alta individual
  const [documentType, setDocumentType] = useState<DocumentType>('CC');
  const [documentNumber, setDocumentNumber] = useState('');
  const [institutionalCode, setInstitutionalCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [personType, setPersonType] = useState<PersonType>('student');
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [creating, setCreating] = useState(false);

  // Estado detalle y QR de carné
  const [selectedPerson, setSelectedPerson] = useState<PersonDto | null>(null);
  const [personQrUrl, setPersonQrUrl] = useState<string | null>(null);

  // Estado importación CSV
  const [csvContent, setCsvContent] = useState(SAMPLE_CSV);
  const [importResult, setImportResult] = useState<ImportPeopleResponse | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const queryParam = searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : '';
        const list = await apiRequest<PersonDto[]>(`/people${queryParam}`);
        if (active) setPeople(list);
      } catch (err) {
        if (active && err instanceof ApiClientError) {
          setErrorMessage(err.detail);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [searchQuery]);

  const handleSelectPersonQr = async (person: PersonDto) => {
    setSelectedPerson(person);
    const dataUrl = await QRCode.toDataURL(person.qrToken, {
      width: 220,
      margin: 2,
      color: {
        dark: '#061b31',
        light: '#ffffff',
      },
    });
    setPersonQrUrl(dataUrl);
  };

  const handleRotateQr = async (person: PersonDto) => {
    setErrorMessage(null);
    try {
      const updated = await apiRequest<PersonDto>(`/people/${person.id}/rotate-qr`, {
        method: 'POST',
      });
      setPeople((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      await handleSelectPersonQr(updated);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      }
    }
  };

  const handleCreatePerson = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setCreating(true);
    try {
      const created = await apiRequest<PersonDto>('/people', {
        method: 'POST',
        body: {
          documentType,
          documentNumber: documentNumber.trim(),
          institutionalCode: institutionalCode.trim() || null,
          fullName: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          personType,
          isMinor,
          guardianName: isMinor ? guardianName.trim() : null,
          guardianPhone: isMinor ? guardianPhone.trim() : null,
          consentAccepted: true,
          consentVersion: 'v1.0',
        },
      });
      setPeople((prev) => [created, ...prev]);
      setDocumentNumber('');
      setInstitutionalCode('');
      setFullName('');
      setEmail('');
      setPhone('');
      setGuardianName('');
      setGuardianPhone('');
      setIsMinor(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('No fue posible registrar el participante.');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRunImport = async (dryRun: boolean) => {
    setErrorMessage(null);
    setImporting(true);
    try {
      const res = await apiRequest<ImportPeopleResponse>('/people/import', {
        method: 'POST',
        body: {
          csvContent,
          dryRun,
        },
      });
      setImportResult(res);
      if (!dryRun) {
        const refreshed = await apiRequest<PersonDto[]>('/people');
        setPeople(refreshed);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('Error al procesar el archivo CSV.');
      }
    } finally {
      setImporting(false);
    }
  };

  const columns: TableColumn<PersonDto>[] = [
    {
      key: 'fullName',
      header: 'Participante',
      render: (row) => (
        <div>
          <p className="font-medium text-[var(--text-heading)]">{row.fullName}</p>
          <p className="text-xs text-[var(--text-muted)]">
            Confirmación pública: <span className="font-mono">{row.abbreviatedName}</span>
          </p>
        </div>
      ),
    },
    {
      key: 'document',
      header: 'Documento / Código',
      mono: true,
      render: (row) => (
        <div>
          <p className="text-xs text-[var(--text-heading)]">
            {row.documentType} {row.documentNumber}
          </p>
          {row.institutionalCode && (
            <p className="text-xs text-[var(--text-muted)]">Cód: {row.institutionalCode}</p>
          )}
        </div>
      ),
    },
    {
      key: 'personType',
      header: 'Vínculo',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Badge status="info">{PERSON_TYPE_LABELS[row.personType]}</Badge>
          {row.isMinor && <Badge status="warning">Menor</Badge>}
        </div>
      ),
    },
    {
      key: 'qrToken',
      header: 'Carné QR',
      align: 'right',
      render: (row) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleSelectPersonQr(row)}
        >
          Ver QR ({row.qrToken.slice(0, 6)}…)
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
            Participantes y estudiantes
          </p>
          <h1 className="mt-1 text-2xl font-light text-[var(--text-heading)] tracking-tight">
            Directorio e importación guiada
          </h1>
          <p className="mt-1 text-sm text-[var(--text-body)]">
            Datos ficticios para el piloto con soporte de importación CSV, validación fila por fila
            y carné QR único.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={activeTab === 'directory' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('directory')}
          >
            Directorio ({people.length})
          </Button>
          {canEdit && (
            <Button
              type="button"
              variant={activeTab === 'import' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('import')}
            >
              Importar CSV
            </Button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3.5 py-2.5 text-sm text-[var(--status-danger-text)]"
        >
          {errorMessage}
        </div>
      )}

      {activeTab === 'directory' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
            <Card
              title="Directorio de participantes"
              description={
                loading
                  ? 'Consultando directorio…'
                  : `${people.length} personas encontradas en tu entidad.`
              }
            >
              <div className="mb-4">
                <Input
                  label="Buscar por documento, código estudiantil o nombre"
                  placeholder="Ej. 1116240101, 20231010 o Juan Pérez"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <Table
                columns={columns}
                rows={people}
                getRowKey={(row) => row.id}
                emptyMessage="No se encontraron participantes con ese criterio."
              />
            </Card>

            {selectedPerson && personQrUrl && (
              <Card
                title={`Carné QR único — ${selectedPerson.fullName}`}
                description="Este código QR identifica al participante en modo kiosco y préstamos asistidos."
              >
                <div className="mt-2 flex flex-col sm:flex-row items-center gap-6 p-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-raised)]">
                  <img
                    src={personQrUrl}
                    alt={`QR de ${selectedPerson.fullName}`}
                    className="h-40 w-40 rounded-[var(--radius-control)] border border-[var(--border)] bg-white p-2"
                  />
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-[var(--text-heading)]">
                      {selectedPerson.fullName}
                    </p>
                    <p className="font-mono text-xs text-[var(--text-body)]">
                      Documento: {selectedPerson.documentType} {selectedPerson.maskedDocument}
                    </p>
                    <p className="font-mono text-xs text-[var(--text-body)]">
                      Token QR: {selectedPerson.qrToken}
                    </p>
                    <div className="pt-2 flex items-center gap-2">
                      {canEdit && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRotateQr(selectedPerson)}
                        >
                          Rotar token QR (por pérdida de carné)
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedPerson(null);
                          setPersonQrUrl(null);
                        }}
                      >
                        Cerrar
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {canEdit && (
            <Card
              title="Registro individual"
              description="Agrega un participante manualmente con autorización Ley 1581."
            >
              <form onSubmit={(e) => void handleCreatePerson(e)} className="mt-2 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label
                      htmlFor="doc-type-select"
                      className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
                    >
                      Tipo doc.
                    </label>
                    <select
                      id="doc-type-select"
                      value={documentType}
                      onChange={(e) => {
                        const next = e.target.value as DocumentType;
                        setDocumentType(next);
                        if (next === 'TI') setIsMinor(true);
                      }}
                      className="w-full h-10 px-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-heading)]"
                    >
                      <option value="CC">CC</option>
                      <option value="TI">TI</option>
                      <option value="CE">CE</option>
                      <option value="PAS">PAS</option>
                      <option value="OTRO">OTRO</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      label="Número de documento"
                      placeholder="1116240101"
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <Input
                  label="Código estudiantil o institucional (opcional)"
                  placeholder="Ej. 20231010"
                  value={institutionalCode}
                  onChange={(e) => setInstitutionalCode(e.target.value)}
                />

                <Input
                  label="Nombre completo"
                  placeholder="Ej. Juan Camilo Pérez Gómez"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />

                <Input
                  label="Correo electrónico (para certificados y avisos)"
                  type="email"
                  placeholder="estudiante@uceva.edu.co"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <Input
                  label="Teléfono de contacto"
                  placeholder="3150001122"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />

                <div>
                  <label
                    htmlFor="person-type-select"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
                  >
                    Vínculo con la entidad
                  </label>
                  <select
                    id="person-type-select"
                    value={personType}
                    onChange={(e) => setPersonType(e.target.value as PersonType)}
                    className="w-full h-10 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-heading)]"
                  >
                    <option value="student">Estudiante</option>
                    <option value="teacher">Docente</option>
                    <option value="administrative">Administrativo</option>
                    <option value="external">Externo</option>
                    <option value="other">Otro</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs text-[var(--text-body)]">
                  <input
                    type="checkbox"
                    checked={isMinor}
                    onChange={(e) => setIsMinor(e.target.checked)}
                  />
                  <span>Es menor de edad (requiere datos del acudiente)</span>
                </label>

                {isMinor && (
                  <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3">
                    <Input
                      label="Nombre del acudiente"
                      placeholder="Nombre completo del padre/madre o acudiente"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      required
                    />
                    <Input
                      label="Teléfono del acudiente"
                      placeholder="3100001122"
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value)}
                      required
                    />
                  </div>
                )}

                {/* Única acción cromática principal de la vista */}
                <Button type="submit" variant="primary" className="w-full" disabled={creating}>
                  {creating ? 'Registrando…' : 'Guardar participante'}
                </Button>
              </form>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <Card
            title="Importación masiva por CSV con vista previa"
            description="Valida el archivo antes de guardar. Reporta cualquier error fila por fila (separador ';' o ',')."
          >
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="csv-textarea"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
                >
                  Contenido CSV (encabezado + filas)
                </label>
                <textarea
                  id="csv-textarea"
                  rows={7}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  className="w-full p-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] font-mono text-xs text-[var(--text-heading)]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleRunImport(true)}
                  disabled={importing}
                >
                  Previsualizar y validar filas
                </Button>

                {/* Única acción cromática principal en la pestaña de importación */}
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void handleRunImport(false)}
                  disabled={importing}
                >
                  Confirmar e importar filas válidas
                </Button>
              </div>
            </div>
          </Card>

          {importResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card
                title={
                  importResult.dryRun
                    ? `Vista previa (${importResult.validRowsCount} de ${importResult.totalRows} filas válidas)`
                    : `Importación aplicada (${importResult.createdCount} nuevos, ${importResult.updatedCount} actualizados)`
                }
                description="Upsert por tipo y número de documento dentro de la entidad."
              >
                <div className="space-y-2 text-xs">
                  {importResult.preview.map((row) => (
                    <div
                      key={row.rowNumber}
                      className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2"
                    >
                      <div>
                        <span className="font-mono text-[var(--text-muted)] mr-2">
                          Fila {row.rowNumber}:
                        </span>
                        <span className="font-medium text-[var(--text-heading)]">
                          {row.fullName}
                        </span>
                        <span className="ml-2 font-mono text-[var(--text-muted)]">
                          ({row.documentType} {row.documentNumber})
                        </span>
                      </div>
                      <Badge status={row.action === 'create' ? 'success' : 'info'}>
                        {row.action === 'create' ? 'Crear' : 'Actualizar'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>

              <Card
                title={`Errores detectados por fila (${importResult.errors.length})`}
                description="Cada fila con error indica el número exacto de línea y la columna que debe corregirse."
              >
                {importResult.errors.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    No se encontraron errores en el archivo CSV.
                  </p>
                ) : (
                  <div className="space-y-2 text-xs">
                    {importResult.errors.map((err, idx) => (
                      <div
                        key={`${err.rowNumber}-${idx}`}
                        className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-[var(--status-danger-text)]"
                      >
                        <p className="font-mono font-medium">
                          Fila {err.rowNumber} — Columna: {err.field}
                        </p>
                        <p className="mt-0.5">{err.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
