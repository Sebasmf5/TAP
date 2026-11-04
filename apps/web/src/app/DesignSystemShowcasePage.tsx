import { useState } from 'react';
import { getPublicEnv } from '../shared/lib/env.ts';
import {
  Badge,
  Button,
  Card,
  ChartFrame,
  Input,
  StatCard,
  Table,
  ThemeToggle,
  type BadgeStatus,
  type ChartSeriesPoint,
} from '../shared/ui/index.ts';

interface DemoEventRow {
  readonly code: string;
  readonly name: string;
  readonly site: string;
  readonly attendees: number;
  readonly status: BadgeStatus;
  readonly statusLabel: string;
}

const DEMO_SERIES: ReadonlyArray<ChartSeriesPoint> = [
  { period: '08:00', checkins: 184, loans: 22 },
  { period: '09:00', checkins: 412, loans: 49 },
  { period: '10:00', checkins: 689, loans: 64 },
  { period: '11:00', checkins: 530, loans: 51 },
  { period: '12:00', checkins: 245, loans: 33 },
  { period: '14:00', checkins: 390, loans: 44 },
];

const DEMO_ROWS: ReadonlyArray<DemoEventRow> = [
  {
    code: 'K7M4P9Q2',
    name: 'Jornada de Bienvenida Universitaria',
    site: 'Coliseo Central',
    attendees: 1842,
    status: 'success',
    statusLabel: 'Abierto',
  },
  {
    code: 'R3W8X5N6',
    name: 'Torneo Relámpago de Tenis de Mesa',
    site: 'Punto Deportivo Norte',
    attendees: 128,
    status: 'info',
    statusLabel: 'Programado',
  },
  {
    code: 'B2D9F4H7',
    name: 'Taller de Primeros Auxilios — Sesión 3',
    site: 'Auditorio Bloque B',
    attendees: 64,
    status: 'warning',
    statusLabel: 'Por cerrar',
  },
  {
    code: 'J6C3V8Z4',
    name: 'Préstamo de Implementos Recreativos',
    site: 'Sede Principal',
    attendees: 312,
    status: 'danger',
    statusLabel: '1 mora activa',
  },
];

export function DesignSystemShowcasePage() {
  const { appName } = getPublicEnv();
  const [documentInput, setDocumentInput] = useState('1116254789');
  const [codeInput, setCodeInput] = useState('202610452');

  return (
    <div className="min-h-screen bg-canvas text-body">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-medium uppercase tracking-widest text-heading">
              {appName}
            </span>
            <span className="text-xs text-muted">
              Bienestar Universitario · Sistema de componentes base
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex max-w-[1280px] flex-col gap-12 px-6 py-10">
        <section className="flex flex-col gap-4 border-b border-border pb-10">
          <span className="text-xs uppercase tracking-widest text-muted">
            Fase 0 · Cimientos y sistema de diseño
          </span>
          <h1 className="tap-heading-lg text-5xl">
            Asistencia rápida, certificados e inventario verificable
          </h1>
          <p className="max-w-2xl text-base text-body">
            Interfaz construida exclusivamente con tokens semánticos en dos temas y contraste
            verificado según WCAG 2.2 AA. Una única acción cromática principal por vista.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg">
              Registrar asistencia rápida
            </Button>
            <Button variant="outline" size="lg">
              Ver catálogo de implementos
            </Button>
            <Button variant="ghost" size="lg">
              Verificar certificado
            </Button>
          </div>
        </section>

        <section aria-labelledby="stats-heading" className="flex flex-col gap-4">
          <h2 id="stats-heading" className="tap-heading-lg text-3xl">
            Indicadores operativos
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Check-ins hoy"
              value="2.445"
              deltaLabel="+18,4 % frente a la semana anterior"
              trend="up"
            />
            <StatCard
              label="Tiempo mediano por registro"
              value="4,2 s"
              deltaLabel="-1,1 s frente al piloto inicial"
              trend="up"
            />
            <StatCard
              label="Devoluciones a tiempo"
              value="98,2 %"
              deltaLabel="+2,0 puntos porcentuales"
              trend="up"
            />
            <StatCard
              label="Certificados emitidos sin reproceso"
              value="1.190"
              deltaLabel="0 revocaciones en el período"
              trend="neutral"
            />
          </div>
        </section>

        <section
          aria-labelledby="controls-heading"
          className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        >
          <Card className="flex flex-col gap-5">
            <div>
              <h2 id="controls-heading" className="tap-heading-lg text-2xl">
                Campos de identificación y estados
              </h2>
              <p className="mt-1 text-sm text-muted">
                Tipografía monoespaciada y cifras tabulares para documentos y códigos públicos.
              </p>
            </div>
            <Input
              label="Escribe tu número de documento"
              value={documentInput}
              onChange={(e) => setDocumentInput(e.target.value)}
              hint="Sin puntos ni espacios. Ejemplo: 1116254789"
              mono
            />
            <Input
              label="Código estudiantil o institucional"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              hint="Usa el código impreso en tu carné."
              mono
            />
            <Input
              label="Ejemplo de campo con validación"
              defaultValue="12"
              error="El documento debe tener al menos 5 dígitos. Corrige el número e inténtalo de nuevo."
              mono
            />
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Badge status="success">Registrado a las 10:42</Badge>
              <Badge status="info">En curso</Badge>
              <Badge status="warning">Entrega pendiente</Badge>
              <Badge status="danger">Préstamo vencido</Badge>
            </div>
          </Card>

          <ChartFrame
            title="Flujo horario de registros y préstamos"
            description="Distribución en hora local America/Bogota con tabla equivalente para lectores de pantalla."
            data={DEMO_SERIES}
          />
        </section>

        <section aria-labelledby="table-heading" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="table-heading" className="tap-heading-lg text-3xl">
              Actividades y puntos activos
            </h2>
            <span className="text-xs text-muted tap-tabular">
              Mostrando {DEMO_ROWS.length} registros de demostración
            </span>
          </div>
          <Table
            caption="Actividades y puntos activos de demostración"
            getRowKey={(row) => row.code}
            rows={DEMO_ROWS}
            columns={[
              {
                key: 'code',
                header: 'Código público',
                mono: true,
                render: (row) => row.code,
              },
              {
                key: 'name',
                header: 'Actividad / Punto',
                render: (row) => <span className="text-heading">{row.name}</span>,
              },
              {
                key: 'site',
                header: 'Sede',
                render: (row) => row.site,
              },
              {
                key: 'attendees',
                header: 'Registros',
                numeric: true,
                render: (row) => row.attendees.toLocaleString('es-CO'),
              },
              {
                key: 'status',
                header: 'Estado',
                render: (row) => <Badge status={row.status}>{row.statusLabel}</Badge>,
              },
            ]}
          />
        </section>
      </main>
    </div>
  );
}
