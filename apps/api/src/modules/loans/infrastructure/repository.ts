import type { LoanStatus, UnitCondition } from '@tap/contracts';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DrizzleExecutor } from '../../../shared/index.ts';
import type { LendingPointEntity, LoanEntity } from '../domain/entities.ts';
import type { LoansRepository } from '../domain/ports.ts';
import { lendingPointsTable, loansTable } from './schema.ts';

function mapPointRow(row: typeof lendingPointsTable.$inferSelect): LendingPointEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    siteId: row.siteId,
    name: row.name,
    publicCode: row.publicCode,
    isOpen: row.isOpen,
    requireOperatorApproval: row.requireOperatorApproval,
    createdAt: row.createdAt,
  };
}

function mapLoanRow(row: typeof loansTable.$inferSelect): LoanEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    siteId: row.siteId,
    lendingPointId: row.lendingPointId ?? null,
    personId: row.personId,
    unitId: row.unitId,
    modelId: row.modelId,
    status: row.status as LoanStatus,
    conditionOut: row.conditionOut as UnitCondition,
    conditionIn: (row.conditionIn as UnitCondition | null) ?? null,
    signaturePath: row.signaturePath,
    signatureSha256: row.signatureSha256,
    dueAt: row.dueAt,
    deliveredAt: row.deliveredAt ?? null,
    returnedAt: row.returnedAt ?? null,
    returnNotes: row.returnNotes ?? null,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  };
}

export class DrizzleLoansRepository implements LoansRepository {
  private readonly db: DrizzleExecutor;

  public constructor(db: DrizzleExecutor) {
    this.db = db;
  }

  public async listLendingPointsByOrganization(
    organizationId: string,
  ): Promise<LendingPointEntity[]> {
    const rows = await this.db
      .select()
      .from(lendingPointsTable)
      .where(eq(lendingPointsTable.organizationId, organizationId))
      .orderBy(desc(lendingPointsTable.createdAt));
    return rows.map(mapPointRow);
  }

  public async findLendingPointById(
    organizationId: string,
    lendingPointId: string,
  ): Promise<LendingPointEntity | null> {
    const [row] = await this.db
      .select()
      .from(lendingPointsTable)
      .where(
        and(
          eq(lendingPointsTable.organizationId, organizationId),
          eq(lendingPointsTable.id, lendingPointId),
        ),
      )
      .limit(1);
    return row ? mapPointRow(row) : null;
  }

  public async findLendingPointByPublicCode(
    publicCode: string,
  ): Promise<LendingPointEntity | null> {
    const [row] = await this.db
      .select()
      .from(lendingPointsTable)
      .where(eq(lendingPointsTable.publicCode, publicCode.trim().toUpperCase()))
      .limit(1);
    return row ? mapPointRow(row) : null;
  }

  public async createLendingPoint(point: LendingPointEntity): Promise<LendingPointEntity> {
    const [inserted] = await this.db
      .insert(lendingPointsTable)
      .values({
        id: point.id,
        organizationId: point.organizationId,
        siteId: point.siteId,
        name: point.name,
        publicCode: point.publicCode,
        isOpen: point.isOpen,
        requireOperatorApproval: point.requireOperatorApproval,
        createdAt: point.createdAt,
      })
      .returning();
    return mapPointRow(inserted!);
  }

  public async findLoanById(organizationId: string, loanId: string): Promise<LoanEntity | null> {
    const [row] = await this.db
      .select()
      .from(loansTable)
      .where(and(eq(loansTable.organizationId, organizationId), eq(loansTable.id, loanId)))
      .limit(1);
    return row ? mapLoanRow(row) : null;
  }

  public async findLoanByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<LoanEntity | null> {
    const [row] = await this.db
      .select()
      .from(loansTable)
      .where(
        and(
          eq(loansTable.organizationId, organizationId),
          eq(loansTable.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row ? mapLoanRow(row) : null;
  }

  public async findActiveLoanByUnitId(
    organizationId: string,
    unitId: string,
  ): Promise<LoanEntity | null> {
    const [row] = await this.db
      .select()
      .from(loansTable)
      .where(
        and(
          eq(loansTable.organizationId, organizationId),
          eq(loansTable.unitId, unitId),
          inArray(loansTable.status, ['active', 'overdue', 'pending_delivery']),
        ),
      )
      .orderBy(desc(loansTable.createdAt))
      .limit(1);
    return row ? mapLoanRow(row) : null;
  }

  public async listLoansByPerson(organizationId: string, personId: string): Promise<LoanEntity[]> {
    const rows = await this.db
      .select()
      .from(loansTable)
      .where(and(eq(loansTable.organizationId, organizationId), eq(loansTable.personId, personId)))
      .orderBy(desc(loansTable.createdAt));
    return rows.map(mapLoanRow);
  }

  public async listLoansByOrganization(
    organizationId: string,
    filters?: { status?: LoanStatus },
  ): Promise<LoanEntity[]> {
    const conditions = [eq(loansTable.organizationId, organizationId)];
    if (filters?.status) {
      conditions.push(eq(loansTable.status, filters.status));
    }
    const rows = await this.db
      .select()
      .from(loansTable)
      .where(and(...conditions))
      .orderBy(desc(loansTable.createdAt));
    return rows.map(mapLoanRow);
  }

  public async insertLoan(loan: LoanEntity): Promise<LoanEntity> {
    const [inserted] = await this.db
      .insert(loansTable)
      .values({
        id: loan.id,
        organizationId: loan.organizationId,
        siteId: loan.siteId,
        lendingPointId: loan.lendingPointId,
        personId: loan.personId,
        unitId: loan.unitId,
        modelId: loan.modelId,
        status: loan.status,
        conditionOut: loan.conditionOut,
        conditionIn: loan.conditionIn,
        signaturePath: loan.signaturePath,
        signatureSha256: loan.signatureSha256,
        dueAt: loan.dueAt,
        deliveredAt: loan.deliveredAt,
        returnedAt: loan.returnedAt,
        returnNotes: loan.returnNotes,
        idempotencyKey: loan.idempotencyKey,
        createdAt: loan.createdAt,
      })
      .returning();
    return mapLoanRow(inserted!);
  }

  public async markLoanReturned(params: {
    organizationId: string;
    loanId: string;
    conditionIn: UnitCondition;
    returnNotes: string | null;
    returnedAt: Date;
  }): Promise<LoanEntity | null> {
    const [updated] = await this.db
      .update(loansTable)
      .set({
        status: 'returned',
        conditionIn: params.conditionIn,
        returnNotes: params.returnNotes,
        returnedAt: params.returnedAt,
      })
      .where(
        and(eq(loansTable.organizationId, params.organizationId), eq(loansTable.id, params.loanId)),
      )
      .returning();
    return updated ? mapLoanRow(updated) : null;
  }

  public async markLoanOverdue(params: {
    organizationId: string;
    loanId: string;
  }): Promise<LoanEntity | null> {
    const [updated] = await this.db
      .update(loansTable)
      .set({
        status: 'overdue',
      })
      .where(
        and(eq(loansTable.organizationId, params.organizationId), eq(loansTable.id, params.loanId)),
      )
      .returning();
    return updated ? mapLoanRow(updated) : null;
  }
}

export class InMemoryLoansRepository implements LoansRepository {
  private readonly points = new Map<string, LendingPointEntity>();
  private readonly loans = new Map<string, LoanEntity>();

  public async listLendingPointsByOrganization(
    organizationId: string,
  ): Promise<LendingPointEntity[]> {
    return Array.from(this.points.values())
      .filter((p) => p.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async findLendingPointById(
    organizationId: string,
    lendingPointId: string,
  ): Promise<LendingPointEntity | null> {
    const p = this.points.get(lendingPointId);
    if (!p || p.organizationId !== organizationId) return null;
    return { ...p };
  }

  public async findLendingPointByPublicCode(
    publicCode: string,
  ): Promise<LendingPointEntity | null> {
    const normalized = publicCode.trim().toUpperCase();
    for (const p of this.points.values()) {
      if (p.publicCode.toUpperCase() === normalized) {
        return { ...p };
      }
    }
    return null;
  }

  public async createLendingPoint(point: LendingPointEntity): Promise<LendingPointEntity> {
    const copy = { ...point };
    this.points.set(copy.id, copy);
    return { ...copy };
  }

  public async findLoanById(organizationId: string, loanId: string): Promise<LoanEntity | null> {
    const loan = this.loans.get(loanId);
    if (!loan || loan.organizationId !== organizationId) return null;
    return { ...loan };
  }

  public async findLoanByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<LoanEntity | null> {
    for (const loan of this.loans.values()) {
      if (loan.organizationId === organizationId && loan.idempotencyKey === idempotencyKey) {
        return { ...loan };
      }
    }
    return null;
  }

  public async findActiveLoanByUnitId(
    organizationId: string,
    unitId: string,
  ): Promise<LoanEntity | null> {
    for (const loan of this.loans.values()) {
      if (
        loan.organizationId === organizationId &&
        loan.unitId === unitId &&
        (loan.status === 'active' ||
          loan.status === 'overdue' ||
          loan.status === 'pending_delivery')
      ) {
        return { ...loan };
      }
    }
    return null;
  }

  public async listLoansByPerson(organizationId: string, personId: string): Promise<LoanEntity[]> {
    return Array.from(this.loans.values())
      .filter((l) => l.organizationId === organizationId && l.personId === personId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async listLoansByOrganization(
    organizationId: string,
    filters?: { status?: LoanStatus },
  ): Promise<LoanEntity[]> {
    return Array.from(this.loans.values())
      .filter(
        (l) =>
          l.organizationId === organizationId && (!filters?.status || l.status === filters.status),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async insertLoan(loan: LoanEntity): Promise<LoanEntity> {
    const copy = { ...loan };
    this.loans.set(copy.id, copy);
    return { ...copy };
  }

  public async markLoanReturned(params: {
    organizationId: string;
    loanId: string;
    conditionIn: UnitCondition;
    returnNotes: string | null;
    returnedAt: Date;
  }): Promise<LoanEntity | null> {
    const existing = this.loans.get(params.loanId);
    if (!existing || existing.organizationId !== params.organizationId) return null;
    const updated: LoanEntity = {
      ...existing,
      status: 'returned',
      conditionIn: params.conditionIn,
      returnNotes: params.returnNotes,
      returnedAt: params.returnedAt,
    };
    this.loans.set(updated.id, updated);
    return { ...updated };
  }

  public async markLoanOverdue(params: {
    organizationId: string;
    loanId: string;
  }): Promise<LoanEntity | null> {
    const existing = this.loans.get(params.loanId);
    if (!existing || existing.organizationId !== params.organizationId) return null;
    const updated: LoanEntity = {
      ...existing,
      status: 'overdue',
    };
    this.loans.set(updated.id, updated);
    return { ...updated };
  }
}
