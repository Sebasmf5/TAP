import type { ReactNode } from 'react';

export interface TableColumn<TRow> {
  readonly key: string;
  readonly header: string;
  readonly numeric?: boolean;
  readonly mono?: boolean;
  render(row: TRow): ReactNode;
}

export interface TableProps<TRow> {
  readonly caption: string;
  readonly columns: ReadonlyArray<TableColumn<TRow>>;
  readonly rows: ReadonlyArray<TRow>;
  readonly getRowKey: (row: TRow) => string;
}

export function Table<TRow>({ caption, columns, rows, getRowKey }: TableProps<TRow>) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-raised">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={[
                  'px-4 py-3 text-xs font-normal uppercase tracking-wider text-muted',
                  col.numeric ? 'text-right' : 'text-left',
                ].join(' ')}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="hover:bg-surface-hover">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={[
                    'px-4 py-3 text-body',
                    col.numeric ? 'text-right tap-tabular' : 'text-left',
                    col.mono ? 'font-mono tap-tabular' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
