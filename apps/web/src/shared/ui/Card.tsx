import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly raised?: boolean;
  readonly children: ReactNode;
}

export function Card({ raised = false, className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={[
        'rounded-card border border-border p-6',
        raised ? 'bg-surface-raised' : 'bg-surface',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
