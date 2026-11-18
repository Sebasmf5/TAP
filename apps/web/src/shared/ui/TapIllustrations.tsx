import type { SVGProps } from 'react';

/**
 * Ilustración editorial plana para la pantalla de entrada (estilo vectorial limpio,
 * adaptada a los tokens semánticos de Tap sin saturar la vista).
 */
export function TapHeroIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 520 210"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      {/* Fondo orgánico suave */}
      <path
        d="M52 170C36 122 68 58 134 52C184 48 206 20 268 24C334 28 362 66 418 70C468 74 494 118 474 170H52Z"
        fill="var(--accent-wash)"
      />
      <line
        x1="28"
        y1="170"
        x2="492"
        y2="170"
        stroke="var(--border-strong)"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Flecha ascendente de progreso */}
      <path
        d="M84 168C184 166 286 128 378 66L364 56L410 46L398 90L386 78C304 140 206 168 84 168Z"
        fill="var(--chart-2)"
        fillOpacity="0.24"
      />

      {/* Sol / meta superior */}
      <circle cx="430" cy="48" r="18" fill="var(--action)" fillOpacity="0.18" />
      <circle cx="430" cy="48" r="10" fill="var(--action)" />
      <path
        d="M402 58C408 50 420 50 426 56C432 50 444 50 452 58H402Z"
        fill="var(--surface)"
        stroke="var(--border)"
        strokeWidth="1.2"
      />

      {/* Hojas decorativas mínimas */}
      <path
        d="M92 170C88 148 76 132 62 122M92 148C100 138 110 134 118 134M84 136C78 124 78 114 82 106"
        stroke="var(--action)"
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M446 170C448 146 458 130 472 120M452 146C444 138 436 136 428 136"
        stroke="var(--chart-2)"
        strokeOpacity="0.7"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Pequeño gráfico de barras de analítica */}
      <rect x="400" y="148" width="12" height="22" rx="2" fill="var(--chart-3)" fillOpacity="0.5" />
      <rect
        x="416"
        y="136"
        width="12"
        height="34"
        rx="2"
        fill="var(--chart-2)"
        fillOpacity="0.65"
      />
      <rect x="432" y="124" width="12" height="46" rx="2" fill="var(--action)" fillOpacity="0.85" />

      {/* Tarjeta móvil central con código QR */}
      <rect
        x="196"
        y="46"
        width="124"
        height="124"
        rx="10"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      <rect x="212" y="60" width="92" height="10" rx="3" fill="var(--accent-wash)" />
      <rect
        x="218"
        y="80"
        width="80"
        height="62"
        rx="6"
        fill="var(--surface-raised)"
        stroke="var(--border)"
      />
      {/* Patrón QR estilizado */}
      <rect x="230" y="90" width="18" height="18" rx="2" stroke="var(--action)" strokeWidth="2.2" />
      <rect x="235" y="95" width="8" height="8" rx="1" fill="var(--action)" />
      <rect
        x="268"
        y="90"
        width="18"
        height="18"
        rx="2"
        stroke="var(--text-heading)"
        strokeWidth="2.2"
      />
      <rect x="273" y="95" width="8" height="8" rx="1" fill="var(--text-heading)" />
      <rect
        x="230"
        y="116"
        width="18"
        height="18"
        rx="2"
        stroke="var(--text-heading)"
        strokeWidth="2.2"
      />
      <rect x="235" y="121" width="8" height="8" rx="1" fill="var(--text-heading)" />
      <rect x="255" y="96" width="6" height="6" rx="1" fill="var(--chart-2)" />
      <rect x="255" y="110" width="6" height="6" rx="1" fill="var(--action)" />
      <rect x="268" y="116" width="18" height="6" rx="1" fill="var(--chart-2)" />
      <rect x="268" y="128" width="12" height="6" rx="1" fill="var(--action)" />
      <rect x="228" y="150" width="60" height="8" rx="4" fill="var(--action)" />

      {/* Persona 1 (izquierda) con credencial / carpeta */}
      <circle
        cx="142"
        cy="90"
        r="13"
        fill="var(--surface)"
        stroke="var(--text-heading)"
        strokeWidth="1.6"
      />
      <path
        d="M132 84C135 76 149 75 153 84"
        stroke="var(--action)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M124 128C124 114 132 106 142 106C152 106 160 114 160 128V142H124V128Z"
        fill="var(--surface)"
        stroke="var(--text-heading)"
        strokeWidth="1.5"
      />
      <rect x="128" y="142" width="11" height="28" rx="3" fill="var(--action)" fillOpacity="0.85" />
      <rect x="145" y="142" width="11" height="28" rx="3" fill="var(--action)" fillOpacity="0.85" />
      <rect x="148" y="114" width="16" height="20" rx="2" fill="var(--chart-2)" />

      {/* Persona 2 (derecha) señalando hacia adelante / diploma */}
      <circle
        cx="348"
        cy="84"
        r="13"
        fill="var(--surface)"
        stroke="var(--text-heading)"
        strokeWidth="1.6"
      />
      <path
        d="M337 78C341 69 356 70 359 79"
        stroke="var(--action)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M330 124C330 110 338 102 348 102C358 102 366 110 366 124V138H330V124Z"
        fill="var(--accent-wash)"
        stroke="var(--text-heading)"
        strokeWidth="1.5"
      />
      <path
        d="M364 108L386 94"
        stroke="var(--text-heading)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect x="334" y="138" width="11" height="32" rx="3" fill="var(--action)" />
      <rect x="351" y="138" width="11" height="32" rx="3" fill="var(--action)" />
      <rect
        x="318"
        y="108"
        width="18"
        height="24"
        rx="3"
        fill="var(--surface)"
        stroke="var(--action)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * Ilustración compacta para el encabezado del panel operativo (sin saturar).
 */
export function TapPanelAccentIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 180 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M16 82C14 50 38 22 76 20C106 18 124 8 150 22C168 32 172 58 164 82H16Z"
        fill="var(--accent-wash)"
      />
      <rect
        x="48"
        y="22"
        width="84"
        height="56"
        rx="6"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeOpacity="0.4"
        strokeWidth="1.4"
      />
      <rect x="58" y="32" width="32" height="6" rx="2" fill="var(--action)" />
      <rect
        x="58"
        y="44"
        width="44"
        height="4"
        rx="2"
        fill="var(--border-strong)"
        fillOpacity="0.4"
      />
      <rect
        x="58"
        y="54"
        width="36"
        height="4"
        rx="2"
        fill="var(--border-strong)"
        fillOpacity="0.3"
      />
      <rect x="104" y="34" width="18" height="18" rx="3" stroke="var(--action)" strokeWidth="1.8" />
      <rect x="109" y="39" width="8" height="8" rx="1" fill="var(--action)" />
      <circle cx="144" cy="24" r="7" fill="var(--chart-2)" fillOpacity="0.7" />
      <circle cx="34" cy="44" r="5" fill="var(--action)" fillOpacity="0.45" />
      <line
        x1="12"
        y1="82"
        x2="168"
        y2="82"
        stroke="var(--border-strong)"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
