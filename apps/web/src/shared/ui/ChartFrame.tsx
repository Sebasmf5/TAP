import { Table as TableIcon, BarChart3 } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { Button } from './Button.tsx';
import { Card } from './Card.tsx';
import { Table } from './Table.tsx';

export interface ChartSeriesPoint {
  readonly period: string;
  readonly checkins: number;
  readonly loans: number;
}

export interface ChartFrameProps {
  readonly title: string;
  readonly description: string;
  readonly data: ReadonlyArray<ChartSeriesPoint>;
}

/**
 * Marco de gráfico con botón «Ver como tabla» para accesibilidad y lectores de pantalla (AGENTS.md A9, B2.1).
 */
export function ChartFrame({ title, description, data }: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false);
  const { tokens } = useTheme();
  const [primarySeries, secondarySeries] = tokens.chartSeries;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="tap-heading-lg text-2xl">{title}</h3>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <Button
          variant="ghost"
          onClick={() => setShowTable((prev) => !prev)}
          aria-pressed={showTable}
        >
          {showTable ? (
            <>
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              <span>Ver gráfico</span>
            </>
          ) : (
            <>
              <TableIcon className="h-4 w-4" aria-hidden="true" />
              <span>Ver como tabla</span>
            </>
          )}
        </Button>
      </div>

      {showTable ? (
        <Table
          caption={`${title} — datos tabulares`}
          getRowKey={(row) => row.period}
          rows={data}
          columns={[
            { key: 'period', header: 'Franja horaria', render: (row) => row.period },
            {
              key: 'checkins',
              header: 'Check-ins registrados',
              numeric: true,
              render: (row) => row.checkins.toLocaleString('es-CO'),
            },
            {
              key: 'loans',
              header: 'Préstamos entregados',
              numeric: true,
              render: (row) => row.loans.toLocaleString('es-CO'),
            },
          ]}
        />
      ) : (
        <div className="h-72 w-full tap-tabular" role="img" aria-label={title}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...data]} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={tokens.border} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="period"
                stroke={tokens.textMuted}
                tick={{ fill: tokens.textMuted, fontSize: 12 }}
              />
              <YAxis stroke={tokens.textMuted} tick={{ fill: tokens.textMuted, fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: tokens.surfaceRaised,
                  borderColor: tokens.borderStrong,
                  color: tokens.textHeading,
                }}
              />
              <Legend />
              <Bar dataKey="checkins" name="Check-ins" fill={primarySeries} radius={[4, 4, 0, 0]} />
              <Bar dataKey="loans" name="Préstamos" fill={secondarySeries} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
