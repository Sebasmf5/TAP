import type {
  AttendanceMethod,
  AttendanceStatus,
  DocumentType,
  IdentificationMode,
  PersonType,
} from '@tap/contracts';
import { ValidationError } from '../../../shared/index.ts';

export interface AttendanceRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly sessionId: string;
  readonly personId: string;
  readonly checkedInAt: Date;
  readonly method: AttendanceMethod;
  readonly registeredBy: string | null;
  readonly status: AttendanceStatus;
  readonly voidReason: string | null;
  readonly voidedAt: Date | null;
  readonly voidedBy: string | null;
  readonly clientDurationMs: number | null;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
}

export interface EventPreregistrationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly personId: string;
  readonly email: string;
  readonly createdAt: Date;
}

export interface ResolvedPersonIdentity {
  readonly id: string;
  readonly organizationId: string;
  readonly documentType: DocumentType;
  readonly documentNumber: string;
  readonly institutionalCode: string | null;
  readonly fullName: string;
  readonly personType: PersonType;
  readonly qrToken?: string;
}

export interface PersonLookupGateway {
  findById(organizationId: string, personId: string): Promise<ResolvedPersonIdentity | null>;
  findByDocument(
    organizationId: string,
    documentNumber: string,
    documentType?: DocumentType,
  ): Promise<ResolvedPersonIdentity | null>;
  findByInstitutionalCode(
    organizationId: string,
    institutionalCode: string,
  ): Promise<ResolvedPersonIdentity | null>;
  findByQrToken(organizationId: string, qrToken: string): Promise<ResolvedPersonIdentity | null>;
}

export type CheckinIdentificationMode = 'document' | 'institutional_code' | 'person_qr' | 'manual';

export interface IdentificationRequest {
  readonly organizationId: string;
  readonly mode: CheckinIdentificationMode;
  readonly identifier: string;
  readonly documentType?: DocumentType;
}

/**
 * Patrón Strategy (`AGENTS.md` A6 y `docs/especificacion.md` B1.5):
 * Variantes intercambiables para identificar a la persona en el check-in
 * (documento, código estudiantil/institucional, QR del carné o manual por funcionario).
 */
export interface IdentificationStrategy {
  readonly mode: CheckinIdentificationMode;
  identify(
    request: IdentificationRequest,
    gateway: PersonLookupGateway,
  ): Promise<ResolvedPersonIdentity | null>;
}

export class DocumentIdentificationStrategy implements IdentificationStrategy {
  readonly mode = 'document' as const;

  async identify(
    request: IdentificationRequest,
    gateway: PersonLookupGateway,
  ): Promise<ResolvedPersonIdentity | null> {
    const clean = request.identifier.trim();
    if (clean.length < 3) {
      throw new ValidationError('El número de documento debe tener al menos 3 caracteres.');
    }
    return gateway.findByDocument(request.organizationId, clean, request.documentType);
  }
}

export class InstitutionalCodeIdentificationStrategy implements IdentificationStrategy {
  readonly mode = 'institutional_code' as const;

  async identify(
    request: IdentificationRequest,
    gateway: PersonLookupGateway,
  ): Promise<ResolvedPersonIdentity | null> {
    const clean = request.identifier.trim();
    if (clean.length < 3) {
      throw new ValidationError('El código institucional debe tener al menos 3 caracteres.');
    }
    return gateway.findByInstitutionalCode(request.organizationId, clean);
  }
}

export class PersonQrIdentificationStrategy implements IdentificationStrategy {
  readonly mode = 'person_qr' as const;

  async identify(
    request: IdentificationRequest,
    gateway: PersonLookupGateway,
  ): Promise<ResolvedPersonIdentity | null> {
    const clean = request.identifier.trim().toUpperCase();
    if (clean.length < 6) {
      throw new ValidationError('El token QR del carné no es válido.');
    }
    return gateway.findByQrToken(request.organizationId, clean);
  }
}

export class ManualStaffIdentificationStrategy implements IdentificationStrategy {
  readonly mode = 'manual' as const;

  async identify(
    request: IdentificationRequest,
    gateway: PersonLookupGateway,
  ): Promise<ResolvedPersonIdentity | null> {
    const clean = request.identifier.trim();
    if (clean.length < 3) {
      throw new ValidationError('Ingresa un documento o código institucional válido.');
    }
    const byDoc = await gateway.findByDocument(request.organizationId, clean, request.documentType);
    if (byDoc) return byDoc;
    return gateway.findByInstitutionalCode(request.organizationId, clean);
  }
}

export class IdentificationStrategyRegistry {
  private readonly strategies = new Map<CheckinIdentificationMode, IdentificationStrategy>();

  constructor(customStrategies?: readonly IdentificationStrategy[]) {
    const defaults: IdentificationStrategy[] = [
      new DocumentIdentificationStrategy(),
      new InstitutionalCodeIdentificationStrategy(),
      new PersonQrIdentificationStrategy(),
      new ManualStaffIdentificationStrategy(),
    ];
    for (const strategy of customStrategies ?? defaults) {
      this.strategies.set(strategy.mode, strategy);
    }
  }

  async resolve(params: {
    request: IdentificationRequest;
    allowedEventModes: readonly IdentificationMode[];
    isStaffOverride?: boolean;
    gateway: PersonLookupGateway;
  }): Promise<ResolvedPersonIdentity | null> {
    const { request, allowedEventModes, isStaffOverride = false, gateway } = params;

    if (!isStaffOverride) {
      if (request.mode === 'manual' || request.mode === 'person_qr') {
        throw new ValidationError(
          `El modo de identificación "${request.mode}" solo está habilitado para funcionarios.`,
        );
      }
      if (!allowedEventModes.includes(request.mode)) {
        throw new ValidationError(
          `Este evento no admite identificación por "${request.mode}". Modos permitidos: ${allowedEventModes.join(', ')}.`,
        );
      }
    } else if (request.mode === 'person_qr' && !allowedEventModes.includes('person_qr')) {
      throw new ValidationError('Este evento no tiene habilitado el escaneo de carné QR.');
    }

    const strategy = this.strategies.get(request.mode);
    if (!strategy) {
      throw new ValidationError(`Estrategia de identificación desconocida: "${request.mode}".`);
    }

    return strategy.identify(request, gateway);
  }
}

export function computeMedian(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }
  const left = sorted[mid - 1] ?? 0;
  const right = sorted[mid] ?? 0;
  return Math.round((left + right) / 2);
}

export function selectActiveEventSession<
  TSession extends {
    readonly id: string;
    readonly sessionNumber: number;
    readonly title: string;
    readonly startsAt: Date;
    readonly endsAt: Date;
  },
>(sessions: readonly TSession[], now: Date, requestedSessionId?: string): TSession {
  if (sessions.length === 0) {
    throw new ValidationError('El evento no tiene sesiones configuradas.');
  }

  if (requestedSessionId) {
    const found = sessions.find((s) => s.id === requestedSessionId);
    if (!found) {
      throw new ValidationError('La sesión indicada no pertenece a este evento.');
    }
    return found;
  }

  // Si hay una sesión ocurriendo ahora o por iniciar hoy, seleccionarla; si no, la primera.
  const current = sessions.find(
    (s) =>
      s.startsAt.getTime() - 30 * 60_000 <= now.getTime() && now.getTime() <= s.endsAt.getTime(),
  );
  return current ?? sessions[0]!;
}
