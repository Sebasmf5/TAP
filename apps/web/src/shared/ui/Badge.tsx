import { AlertCircle, AlertTriangle, CheckCircle2, Info, Minus } from 'lucide-react';
import type { ReactNode } from 'react';

export type BadgeStatus = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export interface BadgeProps {
  readonly status?: BadgeStatus;
  readonly children: ReactNode;
}

const STATUS_STYLES: Record<BadgeStatus, { classes: string; Icon: typeof Info }> = {
  success: {
    classes: 'bg-status-success-bg text-status-success-text border-status-success-border',
    Icon: CheckCircle2,
  },
  danger: {
    classes: 'bg-status-danger-bg text-status-danger-text border-status-danger-border',
    Icon: AlertCircle,
  },
  warning: {
    classes: 'bg-status-warning-bg text-status-warning-text border-status-warning-border',
    Icon: AlertTriangle,
  },
  info: {
    classes: 'bg-status-info-bg text-status-info-text border-status-info-border',
    Icon: Info,
  },
  neutral: {
    classes: 'bg-surface-raised text-body border-border',
    Icon: Minus,
  },
};

/**
 * Etiqueta de estado: siempre acompaña el color con un icono y texto explícito (AGENTS.md A9).
 */
export function Badge({ status = 'info', children }: BadgeProps) {
  const { classes, Icon } = STATUS_STYLES[status];
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-normal',
        classes,
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
