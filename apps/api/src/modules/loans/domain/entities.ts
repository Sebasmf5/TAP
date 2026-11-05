import type { LoanStatus, UnitCondition } from '@tap/contracts';
import { ConflictError } from '../../../shared/index.ts';

export interface LendingPointEntity {
  id: string;
  organizationId: string;
  siteId: string;
  name: string;
  publicCode: string;
  isOpen: boolean;
  requireOperatorApproval: boolean;
  createdAt: Date;
}

export interface LoanEntity {
  id: string;
  organizationId: string;
  siteId: string;
  lendingPointId: string | null;
  personId: string;
  unitId: string;
  modelId: string;
  status: LoanStatus;
  conditionOut: UnitCondition;
  conditionIn: UnitCondition | null;
  signaturePath: string;
  signatureSha256: string;
  dueAt: Date;
  deliveredAt: Date | null;
  returnedAt: Date | null;
  returnNotes: string | null;
  idempotencyKey: string;
  createdAt: Date;
}

/**
 * Patrón Strategy (AGENTS.md A6): evalúa si un prestatario puede solicitar un nuevo préstamo
 * (bloqueo por mora activa o exceso de préstamos simultáneos).
 */
export interface BorrowerEligibilityStrategy {
  evaluate(context: {
    activeLoans: ReadonlyArray<LoanEntity>;
    now: Date;
    maxSimultaneousLoans: number;
  }): { eligible: boolean; reason: string | null };
}

export class DefaultBorrowerEligibilityStrategy implements BorrowerEligibilityStrategy {
  public evaluate(context: {
    activeLoans: ReadonlyArray<LoanEntity>;
    now: Date;
    maxSimultaneousLoans: number;
  }): { eligible: boolean; reason: string | null } {
    const overdueLoan = context.activeLoans.find(
      (loan) =>
        loan.status === 'overdue' ||
        ((loan.status === 'active' || loan.status === 'pending_delivery') &&
          loan.dueAt.getTime() < context.now.getTime()),
    );

    if (overdueLoan) {
      return {
        eligible: false,
        reason:
          'Tienes un préstamo vencido pendiente de devolución. Devuelve el implemento en el punto de atención para habilitar nuevos préstamos.',
      };
    }

    const activeCount = context.activeLoans.filter(
      (l) => l.status === 'active' || l.status === 'pending_delivery',
    ).length;

    if (activeCount >= context.maxSimultaneousLoans) {
      return {
        eligible: false,
        reason: `Has alcanzado el máximo permitido de ${context.maxSimultaneousLoans} implemento(s) en préstamo simultáneo.`,
      };
    }

    return {
      eligible: true,
      reason: null,
    };
  }
}

/**
 * Patrón Strategy (AGENTS.md A6): calcula la fecha límite de devolución según el modelo/categoría.
 */
export interface LoanDurationPolicyStrategy {
  computeDueAt(now: Date, loanDurationHours: number): Date;
}

export class StandardLoanDurationPolicyStrategy implements LoanDurationPolicyStrategy {
  public computeDueAt(now: Date, loanDurationHours: number): Date {
    const safeHours = Math.max(1, Math.min(720, loanDurationHours));
    return new Date(now.getTime() + safeHours * 3600_000);
  }
}

/**
 * Patrón State (AGENTS.md A6): transiciones válidas del ciclo de vida de un préstamo.
 */
const ALLOWED_LOAN_TRANSITIONS: Record<LoanStatus, ReadonlyArray<LoanStatus>> = {
  pending_delivery: ['active', 'cancelled'],
  active: ['returned', 'overdue'],
  overdue: ['returned'],
  returned: [],
  cancelled: [],
};

export function assertValidLoanTransition(from: LoanStatus, to: LoanStatus): void {
  const allowed = ALLOWED_LOAN_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ConflictError(
      `Transición de estado de préstamo no permitida: de «${from}» a «${to}».`,
    );
  }
}
