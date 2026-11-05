import type { CertificateOrientation, CertificateSigner, CertificateStatus } from '@tap/contracts';
import type { CertificateRule } from '@tap/contracts';
import { randomInt } from 'node:crypto';

const PUBLIC_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export interface CertificateTemplateEntity {
  id: string;
  organizationId: string;
  title: string;
  bodyTemplate: string;
  logoUrl: string | null;
  signers: CertificateSigner[];
  orientation: CertificateOrientation;
  version: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CertificateTemplateSnapshot {
  title: string;
  bodyText: string;
  holderName: string;
  maskedDocument: string;
  recipientEmail: string | null;
  eventName: string;
  eventDate: string;
  hours: string;
  organizationName: string;
  signers: CertificateSigner[];
  orientation: CertificateOrientation;
  version: number;
}

export interface CertificateEntity {
  id: string;
  organizationId: string;
  eventId: string;
  personId: string;
  templateId: string | null;
  code: string;
  status: CertificateStatus;
  templateSnapshot: CertificateTemplateSnapshot;
  pdfPath: string | null;
  pdfSha256: string | null;
  issuedAt: Date;
  deliveredAt: Date | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  revokedReason: string | null;
  verificationCount: number;
}

/**
 * Calcula el dígito de control Luhn mod N sobre el alfabeto público sin ambigüedades.
 */
export function computeCheckCharacter(baseChars: string): string {
  const n = PUBLIC_ALPHABET.length;
  let factor = 2;
  let sum = 0;

  for (let i = baseChars.length - 1; i >= 0; i -= 1) {
    const codePoint = PUBLIC_ALPHABET.indexOf(baseChars[i] ?? '');
    if (codePoint < 0) {
      throw new Error(`Carácter fuera del alfabeto público: ${baseChars[i]}`);
    }
    let addend = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / n) + (addend % n);
    sum += addend;
  }

  const remainder = sum % n;
  const checkCodePoint = (n - remainder) % n;
  return PUBLIC_ALPHABET[checkCodePoint] ?? '2';
}

/**
 * Genera un código público de 12 caracteres (11 aleatorios + 1 dígito de control).
 */
export function generateCertificateCode(): string {
  let base = '';
  for (let i = 0; i < 11; i += 1) {
    base += PUBLIC_ALPHABET[randomInt(0, PUBLIC_ALPHABET.length)];
  }
  const check = computeCheckCharacter(base);
  return `${base}${check}`;
}

export function isValidCertificateCodeCheckDigit(rawCode: string): boolean {
  const normalized = rawCode.trim().toUpperCase();
  if (normalized.length !== 12) return false;
  for (const ch of normalized) {
    if (!PUBLIC_ALPHABET.includes(ch)) return false;
  }
  const base = normalized.slice(0, 11);
  const expected = computeCheckCharacter(base);
  return normalized[11] === expected;
}

export function interpolateCertificateVariables(
  bodyTemplate: string,
  variables: {
    full_name: string;
    event_name: string;
    date: string;
    hours: string;
  },
): string {
  return bodyTemplate.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    if (key in variables) {
      return variables[key as keyof typeof variables];
    }
    return '';
  });
}

// ============================================================================
// Patrón Strategy / Specification para elegibilidad de certificados (AGENTS.md A6)
// ============================================================================

export interface EligibilityInput {
  attendedSessions: number;
  totalSessions: number;
}

export interface EligibilityResult {
  eligible: boolean;
  attendancePercent: number;
  reason: string;
}

export interface EligibilityStrategy {
  readonly ruleSummary: string;
  evaluate(input: EligibilityInput): EligibilityResult;
}

function computePercent(attended: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((attended / total) * 1000) / 10;
}

export class AnyAttendanceStrategy implements EligibilityStrategy {
  public readonly ruleSummary = 'Cualquier asistencia válida (mínimo 1 sesión)';

  public evaluate(input: EligibilityInput): EligibilityResult {
    const percent = computePercent(input.attendedSessions, input.totalSessions);
    if (input.attendedSessions >= 1) {
      return {
        eligible: true,
        attendancePercent: percent,
        reason: `Cumple con al menos 1 sesión asistida (${input.attendedSessions}/${input.totalSessions}).`,
      };
    }
    return {
      eligible: false,
      attendancePercent: percent,
      reason: 'No registra ninguna sesión de asistencia válida.',
    };
  }
}

export class MinSessionsStrategy implements EligibilityStrategy {
  private readonly minSessions: number;
  public readonly ruleSummary: string;

  public constructor(minSessions: number) {
    this.minSessions = Math.max(1, minSessions);
    this.ruleSummary = `Mínimo ${this.minSessions} sesión(es) asistidas`;
  }

  public evaluate(input: EligibilityInput): EligibilityResult {
    const percent = computePercent(input.attendedSessions, input.totalSessions);
    if (input.attendedSessions >= this.minSessions) {
      return {
        eligible: true,
        attendancePercent: percent,
        reason: `Asistió a ${input.attendedSessions} de ${input.totalSessions} sesiones (mínimo requerido: ${this.minSessions}).`,
      };
    }
    return {
      eligible: false,
      attendancePercent: percent,
      reason: `Asistió a ${input.attendedSessions} de ${input.totalSessions} sesiones; requiere al menos ${this.minSessions}.`,
    };
  }
}

export class MinAttendancePercentStrategy implements EligibilityStrategy {
  private readonly minPercent: number;
  public readonly ruleSummary: string;

  public constructor(minPercent: number) {
    this.minPercent = Math.max(1, Math.min(100, minPercent));
    this.ruleSummary = `Porcentaje mínimo de asistencia del ${this.minPercent}%`;
  }

  public evaluate(input: EligibilityInput): EligibilityResult {
    const percent = computePercent(input.attendedSessions, input.totalSessions);
    if (percent >= this.minPercent) {
      return {
        eligible: true,
        attendancePercent: percent,
        reason: `Alcanzó ${percent}% de asistencia (${input.attendedSessions}/${input.totalSessions} sesiones; mínimo: ${this.minPercent}%).`,
      };
    }
    return {
      eligible: false,
      attendancePercent: percent,
      reason: `Alcanzó ${percent}% de asistencia (${input.attendedSessions}/${input.totalSessions} sesiones); requiere mínimo ${this.minPercent}%.`,
    };
  }
}

export class NoCertificateStrategy implements EligibilityStrategy {
  public readonly ruleSummary = 'El evento no otorga certificado de participación';

  public evaluate(input: EligibilityInput): EligibilityResult {
    return {
      eligible: false,
      attendancePercent: computePercent(input.attendedSessions, input.totalSessions),
      reason: 'La configuración del evento no contempla emisión de certificados.',
    };
  }
}

export function createEligibilityStrategy(rule: CertificateRule): EligibilityStrategy {
  switch (rule.type) {
    case 'any_attendance':
      return new AnyAttendanceStrategy();
    case 'min_sessions':
      return new MinSessionsStrategy(rule.minSessions ?? 1);
    case 'min_attendance_percent':
      return new MinAttendancePercentStrategy(rule.minPercent ?? 80);
    case 'none':
    default:
      return new NoCertificateStrategy();
  }
}
