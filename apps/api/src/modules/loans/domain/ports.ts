import type { LoanDto, LoanStatus, UnitCondition } from '@tap/contracts';
import type { LendingPointEntity, LoanEntity } from './entities.ts';

export interface LoanReceiptRenderer {
  renderReceiptPdf(params: { loan: LoanDto; organizationName: string }): Promise<Buffer>;
}

export interface LoansRepository {
  listLendingPointsByOrganization(organizationId: string): Promise<LendingPointEntity[]>;
  findLendingPointById(
    organizationId: string,
    lendingPointId: string,
  ): Promise<LendingPointEntity | null>;
  findLendingPointByPublicCode(publicCode: string): Promise<LendingPointEntity | null>;
  createLendingPoint(point: LendingPointEntity): Promise<LendingPointEntity>;

  findLoanById(organizationId: string, loanId: string): Promise<LoanEntity | null>;
  findLoanByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<LoanEntity | null>;
  findActiveLoanByUnitId(organizationId: string, unitId: string): Promise<LoanEntity | null>;
  listLoansByPerson(organizationId: string, personId: string): Promise<LoanEntity[]>;
  listLoansByOrganization(
    organizationId: string,
    filters?: { status?: LoanStatus },
  ): Promise<LoanEntity[]>;
  insertLoan(loan: LoanEntity): Promise<LoanEntity>;
  markLoanReturned(params: {
    organizationId: string;
    loanId: string;
    conditionIn: UnitCondition;
    returnNotes: string | null;
    returnedAt: Date;
  }): Promise<LoanEntity | null>;
  markLoanOverdue(params: { organizationId: string; loanId: string }): Promise<LoanEntity | null>;
}
