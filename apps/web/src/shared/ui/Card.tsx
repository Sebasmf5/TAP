import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly raised?: boolean;
  readonly title?: string;
  readonly description?: string;
  readonly padding?: 'sm' | 'md' | 'lg';
  readonly children: ReactNode;
}

const PADDING_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({
  raised = false,
  title,
  description,
  padding = 'md',
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        'rounded-card border border-border',
        PADDING_CLASSES[padding],
        raised ? 'bg-surface-raised' : 'bg-surface',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-base font-medium text-heading">{title}</h2>}
          {description && <p className="mt-1 text-xs text-muted">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
