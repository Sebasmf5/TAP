import type { SVGProps } from 'react';

export type TapLogoSize = 'sm' | 'md' | 'lg' | 'xl';

export interface TapLogoProps {
  readonly size?: TapLogoSize;
  readonly subtitle?: string;
  readonly showWordmark?: boolean;
  readonly className?: string;
}

const MARK_SIZE_CLASSES: Record<TapLogoSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-14 w-14',
};

const WORDMARK_SIZE_CLASSES: Record<TapLogoSize, string> = {
  sm: 'text-base font-semibold tracking-tight',
  md: 'text-lg font-semibold tracking-tight',
  lg: 'text-2xl font-medium tracking-tight',
  xl: 'text-3xl font-medium tracking-tight',
};

const SUBTITLE_SIZE_CLASSES: Record<TapLogoSize, string> = {
  sm: 'text-xs',
  md: 'text-xs',
  lg: 'text-xs',
  xl: 'text-sm',
};

/**
 * Isotipo minimalista de Tap: punto de toque con ondas concéntricas sobre una T geométrica.
 * Usa exclusivamente tokens semánticos del tema activo.
 */
export function TapMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="2" width="44" height="44" rx="11" fill="var(--action)" />
      {/* Ondas concéntricas que evocan el toque rápido (tap) */}
      <path
        d="M16.22 12.72A11 11 0 0 1 31.78 12.72"
        stroke="var(--action-text)"
        strokeOpacity="0.45"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M19.02 16.32A6.5 6.5 0 0 1 28.98 16.32"
        stroke="var(--action-text)"
        strokeOpacity="0.82"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Punto de contacto */}
      <circle cx="24" cy="20.5" r="2.4" fill="var(--action-text)" />
      {/* Monograma T geométrico */}
      <rect x="14" y="25.5" width="20" height="3.6" rx="1.8" fill="var(--action-text)" />
      <rect x="22.2" y="25.5" width="3.6" height="13.5" rx="1.8" fill="var(--action-text)" />
    </svg>
  );
}

/**
 * Logotipo completo de Tap (isotipo + wordmark opcional y subtítulo).
 */
export function TapLogo({
  size = 'md',
  subtitle,
  showWordmark = true,
  className = '',
}: TapLogoProps) {
  return (
    <div className={`inline-flex items-center gap-3 min-w-0 ${className}`}>
      <TapMark className={`${MARK_SIZE_CLASSES[size]} shrink-0`} />
      {showWordmark && (
        <div className="min-w-0">
          <span
            className={`block text-[var(--text-heading)] leading-none ${WORDMARK_SIZE_CLASSES[size]}`}
          >
            Tap
          </span>
          {subtitle && (
            <span
              className={`block mt-1 text-[var(--text-muted)] truncate leading-tight ${SUBTITLE_SIZE_CLASSES[size]}`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
