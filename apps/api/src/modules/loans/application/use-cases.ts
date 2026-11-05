import type {
  CreateLendingPointRequest,
  DocumentType,
  ItemModelDto,
  LendingPointDto,
  LoanDto,
  LoanStatus,
  OverdueSweepResponse,
  PersonType,
  PublicBorrowerLookupRequest,
  PublicBorrowerLookupResponse,
  PublicLendingPointInfo,
  PublicLoanCreateRequest,
  ReturnLoanByQrRequest,
  ReturnLoanRequest,
  UnitCondition,
} from '@tap/contracts';
import { createHash } from 'node:crypto';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  formatBogotaDateTime,
  type AuditLog,
  type Clock,
  type EventBus,
  type FileStorage,
  type IdGenerator,
  type TenantContext,
} from '../../../shared/index.ts';
import type { InventoryUnitEntity, ItemModelEntity } from '../../inventory/index.ts';
import type { Organization } from '../../organizations/index.ts';
import { abbreviatePersonName, maskDocumentNumber, type Person } from '../../people/index.ts';
import {
  DefaultBorrowerEligibilityStrategy,
  StandardLoanDurationPolicyStrategy,
  assertValidLoanTransition,
  type BorrowerEligibilityStrategy,
  type LendingPointEntity,
  type LoanDurationPolicyStrategy,
  type LoanEntity,
} from '../domain/entities.ts';
import type { LoanReceiptRenderer, LoansRepository } from '../domain/ports.ts';

type StaffActor = TenantContext;

function assertStaffOrganization(actor: StaffActor): string {
  if (!actor.organizationId) {
    throw new ForbiddenError('Esta operación requiere pertenecer a una entidad activa.');
  }
  return actor.organizationId;
}

function assertOperatorOrAdmin(actor: StaffActor): string {
  const orgId = assertStaffOrganization(actor);
  if (actor.role !== 'org_admin' && actor.role !== 'operator') {
    throw new ForbiddenError(
      'Solo administradores u operadores pueden gestionar entregas o devoluciones de implementos.',
    );
  }
  return orgId;
}

function toLendingPointDto(p: LendingPointEntity): LendingPointDto {
  return {
    id: p.id,
    organizationId: p.organizationId,
    siteId: p.siteId,
    name: p.name,
    publicCode: p.publicCode,
    isOpen: p.isOpen,
    requireOperatorApproval: p.requireOperatorApproval,
    createdAt: p.createdAt.toISOString(),
  };
}

export class LoansService {
  private readonly repository: LoansRepository;
  private readonly receiptRenderer: LoanReceiptRenderer;
  private readonly fileStorage: FileStorage;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly eventBus: EventBus;
  private readonly auditLog: AuditLog;
  private readonly eligibilityStrategy: BorrowerEligibilityStrategy;
  private readonly durationPolicy: LoanDurationPolicyStrategy;
  private readonly findOrganizationById: (organizationId: string) => Promise<Organization | null>;
  private readonly assertFeatureEnabled: (
    organizationId: string,
    feature: 'loans',
  ) => Promise<void>;
  private readonly inventoryGateway: {
    listModelsInternal: (organizationId: string) => Promise<ItemModelDto[]>;
    claimAvailableUnitForLoan: (params: {
      organizationId: string;
      modelId: string;
      siteId?: string;
    }) => Promise<{ unit: InventoryUnitEntity; model: ItemModelEntity } | null>;
    releaseUnitFromLoan: (params: {
      organizationId: string;
      unitId: string;
      conditionIn: UnitCondition;
      notes?: string | null;
    }) => Promise<InventoryUnitEntity | null>;
    findUnitByQrOrCode: (
      organizationId: string,
      qrOrCode: string,
    ) => Promise<InventoryUnitEntity | null>;
    findUnitById: (organizationId: string, unitId: string) => Promise<InventoryUnitEntity | null>;
    findModelById: (organizationId: string, modelId: string) => Promise<ItemModelEntity | null>;
  };
  private readonly personGateway: {
    findById: (organizationId: string, personId: string) => Promise<Person | null>;
    findByDocument: (
      organizationId: string,
      documentType: DocumentType | undefined,
      documentNumber: string,
    ) => Promise<Person | null>;
    findByInstitutionalCode: (organizationId: string, code: string) => Promise<Person | null>;
    registerPublicWalkInPerson: (params: {
      organizationId: string;
      documentType: DocumentType;
      documentNumber: string;
      fullName: string;
      institutionalCode?: string | null;
      email?: string | null;
      phone?: string | null;
      personType?: PersonType;
      isMinor: boolean;
      consentVersion: string;
      channel: 'public_loan';
      ipHash?: string | null;
    }) => Promise<Person>;
  };

  public constructor(deps: {
    repository: LoansRepository;
    receiptRenderer: LoanReceiptRenderer;
    fileStorage: FileStorage;
    idGenerator: IdGenerator;
    clock: Clock;
    eventBus: EventBus;
    auditLog: AuditLog;
    eligibilityStrategy?: BorrowerEligibilityStrategy;
    durationPolicy?: LoanDurationPolicyStrategy;
    findOrganizationById: (organizationId: string) => Promise<Organization | null>;
    assertFeatureEnabled: (organizationId: string, feature: 'loans') => Promise<void>;
    inventoryGateway: LoansService['inventoryGateway'];
    personGateway: LoansService['personGateway'];
  }) {
    this.repository = deps.repository;
    this.receiptRenderer = deps.receiptRenderer;
    this.fileStorage = deps.fileStorage;
    this.idGenerator = deps.idGenerator;
    this.clock = deps.clock;
    this.eventBus = deps.eventBus;
    this.auditLog = deps.auditLog;
    this.eligibilityStrategy = deps.eligibilityStrategy ?? new DefaultBorrowerEligibilityStrategy();
    this.durationPolicy = deps.durationPolicy ?? new StandardLoanDurationPolicyStrategy();
    this.findOrganizationById = deps.findOrganizationById;
    this.assertFeatureEnabled = deps.assertFeatureEnabled;
    this.inventoryGateway = deps.inventoryGateway;
    this.personGateway = deps.personGateway;
  }

  public async listLendingPoints(actor: StaffActor): Promise<LendingPointDto[]> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'loans');
    const points = await this.repository.listLendingPointsByOrganization(orgId);
    return points.map(toLendingPointDto);
  }

  public async createLendingPoint(
    actor: StaffActor,
    input: CreateLendingPointRequest,
  ): Promise<LendingPointDto> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'loans');

    const created = await this.repository.createLendingPoint({
      id: this.idGenerator.nextId(),
      organizationId: orgId,
      siteId: input.siteId,
      name: input.name.trim(),
      publicCode: this.idGenerator.publicCode(6),
      isOpen: input.isOpen,
      requireOperatorApproval: input.requireOperatorApproval,
      createdAt: this.clock.now(),
    });
    return toLendingPointDto(created);
  }

  // ===========================================================================
  // Flujos públicos de préstamo (`/p/:code`, sin cuenta)
  // ===========================================================================

  public async getPublicLendingPointInfo(publicCode: string): Promise<PublicLendingPointInfo> {
    const point = await this.repository.findLendingPointByPublicCode(publicCode);
    if (!point) {
      throw new NotFoundError('No se encontró el punto de préstamo solicitado.');
    }

    await this.assertFeatureEnabled(point.organizationId, 'loans');

    const [org, models] = await Promise.all([
      this.findOrganizationById(point.organizationId),
      this.inventoryGateway.listModelsInternal(point.organizationId),
    ]);

    return {
      id: point.id,
      name: point.name,
      publicCode: point.publicCode,
      isOpen: point.isOpen,
      organization: {
        name: org?.name ?? 'Bienestar Institucional',
        dataConsentVersion: org?.dataConsentVersion ?? 'v1.0-2025',
        dataConsentText:
          org?.dataConsentText ??
          'Autorizo el tratamiento de mis datos personales para el préstamo de implementos institucionales conforme a la Ley 1581 de 2012.',
      },
      availableModels: models.map((m) => ({
        id: m.id,
        name: m.name,
        categoryName: m.categoryName,
        codePrefix: m.codePrefix,
        loanDurationHours: m.loanDurationHours,
        availableCount: m.availableUnitsCount,
      })),
    };
  }

  public async lookupPublicBorrower(
    publicCode: string,
    input: PublicBorrowerLookupRequest,
  ): Promise<PublicBorrowerLookupResponse> {
    const point = await this.repository.findLendingPointByPublicCode(publicCode);
    if (!point) {
      throw new NotFoundError('No se encontró el punto de préstamo solicitado.');
    }

    const person =
      input.identificationMode === 'institutional_code'
        ? await this.personGateway.findByInstitutionalCode(point.organizationId, input.identifier)
        : await this.personGateway.findByDocument(
            point.organizationId,
            input.documentType,
            input.identifier,
          );

    if (!person) {
      return {
        found: false,
        maskedName: null,
        maskedDocument: null,
        eligible: true,
        ineligibilityReason: null,
      };
    }

    const activeLoans = await this.repository.listLoansByPerson(point.organizationId, person.id);
    const evalResult = this.eligibilityStrategy.evaluate({
      activeLoans,
      now: this.clock.now(),
      maxSimultaneousLoans: 3,
    });

    return {
      found: true,
      maskedName: abbreviatePersonName(person.fullName),
      maskedDocument: maskDocumentNumber(person.documentNumber),
      eligible: evalResult.eligible,
      ineligibilityReason: evalResult.reason,
    };
  }

  public async createPublicLoan(params: {
    publicCode: string;
    idempotencyKey: string | undefined;
    input: PublicLoanCreateRequest;
    ipHash: string | null;
  }): Promise<LoanDto> {
    const idempotencyKey = params.idempotencyKey?.trim();
    if (!idempotencyKey || idempotencyKey.length < 6) {
      throw new ValidationError(
        'La cabecera Idempotency-Key es obligatoria para solicitar un préstamo público.',
      );
    }

    const point = await this.repository.findLendingPointByPublicCode(params.publicCode);
    if (!point) {
      throw new NotFoundError('No se encontró el punto de préstamo solicitado.');
    }
    if (!point.isOpen) {
      throw new ConflictError('Este punto de préstamo se encuentra cerrado temporalmente.');
    }

    await this.assertFeatureEnabled(point.organizationId, 'loans');

    // 1. Verificar idempotencia primero
    const existingByIdempotency = await this.repository.findLoanByIdempotencyKey(
      point.organizationId,
      idempotencyKey,
    );
    if (existingByIdempotency) {
      return this.enrichLoanDto(point.organizationId, existingByIdempotency);
    }

    const org = await this.findOrganizationById(point.organizationId);
    const consentVersion = org?.dataConsentVersion ?? 'v1.0-2025';

    // 2. Resolver prestatario (o registrar walk-in con aceptación Ley 1581)
    let person =
      params.input.identificationMode === 'institutional_code'
        ? await this.personGateway.findByInstitutionalCode(
            point.organizationId,
            params.input.identifier,
          )
        : await this.personGateway.findByDocument(
            point.organizationId,
            params.input.documentType,
            params.input.identifier,
          );

    if (!person) {
      if (!params.input.walkInRegistration) {
        throw new ValidationError(
          'Tu documento no figura en el directorio; completa tus datos básicos para continuar con el préstamo.',
        );
      }

      person = await this.personGateway.registerPublicWalkInPerson({
        organizationId: point.organizationId,
        documentType: params.input.walkInRegistration.documentType,
        documentNumber: params.input.walkInRegistration.documentNumber,
        fullName: params.input.walkInRegistration.fullName,
        institutionalCode: params.input.walkInRegistration.institutionalCode ?? null,
        email: params.input.walkInRegistration.email ?? null,
        phone: params.input.walkInRegistration.phone ?? null,
        personType: params.input.walkInRegistration.personType,
        isMinor: params.input.walkInRegistration.isMinor,
        consentVersion,
        channel: 'public_loan',
        ipHash: params.ipHash,
      });
    }

    // 3. Evaluar elegibilidad (bloqueo por mora activa)
    const activeLoans = await this.repository.listLoansByPerson(point.organizationId, person.id);
    const eligibility = this.eligibilityStrategy.evaluate({
      activeLoans,
      now: this.clock.now(),
      maxSimultaneousLoans: 3,
    });
    if (!eligibility.eligible) {
      throw new ConflictError(
        eligibility.reason ?? 'No cumples las condiciones actuales para solicitar un préstamo.',
      );
    }

    // 4. Reservar atómicamente una unidad disponible del modelo solicitado
    const claimed = await this.inventoryGateway.claimAvailableUnitForLoan({
      organizationId: point.organizationId,
      modelId: params.input.modelId,
    });

    if (!claimed) {
      throw new ConflictError('No quedan unidades disponibles de este implemento en este momento.');
    }

    // 5. Persistir la firma manuscrita digitalizada y su huella SHA-256
    const now = this.clock.now();
    const loanId = this.idGenerator.nextId();
    const signatureBuffer = Buffer.from(params.input.signatureDataUrl, 'utf8');
    const signatureSha256 = createHash('sha256').update(signatureBuffer).digest('hex');
    const signaturePath = `signatures/${point.organizationId}/${loanId}.txt`;
    await this.fileStorage.put(signaturePath, signatureBuffer);

    const dueAt = this.durationPolicy.computeDueAt(now, claimed.model.loanDurationHours);
    const status: LoanStatus = point.requireOperatorApproval ? 'pending_delivery' : 'active';

    const loan = await this.repository.insertLoan({
      id: loanId,
      organizationId: point.organizationId,
      siteId: point.siteId,
      lendingPointId: point.id,
      personId: person.id,
      unitId: claimed.unit.id,
      modelId: claimed.model.id,
      status,
      conditionOut: claimed.unit.condition,
      conditionIn: null,
      signaturePath,
      signatureSha256,
      dueAt,
      deliveredAt: status === 'active' ? now : null,
      returnedAt: null,
      returnNotes: null,
      idempotencyKey,
      createdAt: now,
    });

    const dto = await this.enrichLoanDto(point.organizationId, loan);

    await this.eventBus.publish({
      id: this.idGenerator.nextId(),
      name: 'loan.delivered',
      occurredAt: now,
      organizationId: point.organizationId,
      payload: {
        organizationId: point.organizationId,
        loanId: loan.id,
        borrowerName: person.fullName,
        recipientEmail: person.email,
        itemName: claimed.model.name,
        unitCode: claimed.unit.code,
        dueAtFormatted: formatBogotaDateTime(dueAt),
        organizationName: org?.name ?? 'Bienestar Institucional',
      },
    });

    return dto;
  }

  // ===========================================================================
  // Gestión por funcionarios autenticados
  // ===========================================================================

  public async listLoans(actor: StaffActor, filters?: { status?: LoanStatus }): Promise<LoanDto[]> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'loans');
    return this.listLoansInternal(orgId, filters);
  }

  public async listLoansInternal(
    organizationId: string,
    filters?: { status?: LoanStatus },
  ): Promise<LoanDto[]> {
    const loans = await this.repository.listLoansByOrganization(organizationId, filters);
    const enriched: LoanDto[] = [];
    for (const loan of loans) {
      enriched.push(await this.enrichLoanDto(organizationId, loan));
    }
    return enriched;
  }

  public async returnLoanById(
    actor: StaffActor,
    loanId: string,
    input: ReturnLoanRequest,
  ): Promise<LoanDto> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'loans');

    const loan = await this.repository.findLoanById(orgId, loanId);
    if (!loan) {
      throw new NotFoundError('No se encontró el préstamo solicitado.');
    }

    return this.completeLoanReturn(
      orgId,
      actor.userId,
      loan,
      input.conditionIn,
      input.notes ?? null,
    );
  }

  public async returnLoanByUnitQrOrCode(
    actor: StaffActor,
    input: ReturnLoanByQrRequest,
  ): Promise<LoanDto> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'loans');

    const unit = await this.inventoryGateway.findUnitByQrOrCode(orgId, input.unitQrOrCode);
    if (!unit) {
      throw new NotFoundError(
        `No se encontró ninguna unidad con el código o QR «${input.unitQrOrCode}».`,
      );
    }

    const activeLoan = await this.repository.findActiveLoanByUnitId(orgId, unit.id);
    if (!activeLoan) {
      throw new ConflictError(
        `La unidad ${unit.code} no registra un préstamo activo pendiente de devolución.`,
      );
    }

    return this.completeLoanReturn(
      orgId,
      actor.userId,
      activeLoan,
      input.conditionIn,
      input.notes ?? null,
    );
  }

  private async completeLoanReturn(
    organizationId: string,
    actorUserId: string,
    loan: LoanEntity,
    conditionIn: UnitCondition,
    returnNotes: string | null,
  ): Promise<LoanDto> {
    assertValidLoanTransition(loan.status, 'returned');

    const now = this.clock.now();
    const updated = await this.repository.markLoanReturned({
      organizationId,
      loanId: loan.id,
      conditionIn,
      returnNotes,
      returnedAt: now,
    });

    if (!updated) {
      throw new NotFoundError('No se pudo actualizar el estado del préstamo.');
    }

    await this.inventoryGateway.releaseUnitFromLoan({
      organizationId,
      unitId: loan.unitId,
      conditionIn,
      notes: returnNotes,
    });

    await this.auditLog.record({
      organizationId,
      actorUserId,
      action: 'loan.returned',
      targetType: 'loan',
      targetId: updated.id,
      metadata: {
        unitId: updated.unitId,
        conditionIn,
        returnNotes,
      },
    });

    const dto = await this.enrichLoanDto(organizationId, updated);
    const org = await this.findOrganizationById(organizationId);

    await this.eventBus.publish({
      id: this.idGenerator.nextId(),
      name: 'loan.returned',
      occurredAt: now,
      organizationId,
      payload: {
        organizationId,
        loanId: updated.id,
        borrowerName: dto.borrowerName,
        recipientEmail: dto.borrowerEmail,
        itemName: dto.modelName,
        unitCode: dto.unitCode,
        returnedAtFormatted: formatBogotaDateTime(now),
        organizationName: org?.name ?? 'Bienestar Institucional',
      },
    });

    return dto;
  }

  public async sweepOverdueLoans(actor: StaffActor): Promise<OverdueSweepResponse> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'loans');
    return this.sweepOverdueLoansInternal(orgId);
  }

  public async sweepOverdueLoansInternal(organizationId: string): Promise<OverdueSweepResponse> {
    const now = this.clock.now();
    const activeLoans = await this.repository.listLoansByOrganization(organizationId, {
      status: 'active',
    });
    const org = await this.findOrganizationById(organizationId);

    let newlyMarkedOverdueCount = 0;
    let notificationsEnqueuedCount = 0;

    for (const loan of activeLoans) {
      if (loan.dueAt.getTime() < now.getTime()) {
        const updated = await this.repository.markLoanOverdue({
          organizationId,
          loanId: loan.id,
        });
        if (updated) {
          newlyMarkedOverdueCount += 1;
          const dto = await this.enrichLoanDto(organizationId, updated);
          if (dto.borrowerEmail) {
            notificationsEnqueuedCount += 1;
          }
          await this.eventBus.publish({
            id: this.idGenerator.nextId(),
            name: 'loan.overdue',
            occurredAt: now,
            organizationId,
            payload: {
              organizationId,
              loanId: updated.id,
              borrowerName: dto.borrowerName,
              recipientEmail: dto.borrowerEmail,
              itemName: dto.modelName,
              unitCode: dto.unitCode,
              dueAtFormatted: formatBogotaDateTime(updated.dueAt),
              organizationName: org?.name ?? 'Bienestar Institucional',
            },
          });
        }
      }
    }

    return {
      evaluatedCount: activeLoans.length,
      newlyMarkedOverdueCount,
      notificationsEnqueuedCount,
    };
  }

  public async generateReceiptPdf(
    actor: StaffActor,
    loanId: string,
  ): Promise<{
    code: string;
    pdfBuffer: Buffer;
  }> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'loans');

    const loan = await this.repository.findLoanById(orgId, loanId);
    if (!loan) {
      throw new NotFoundError('No se encontró el préstamo solicitado.');
    }

    const [dto, org] = await Promise.all([
      this.enrichLoanDto(orgId, loan),
      this.findOrganizationById(orgId),
    ]);

    const pdfBuffer = await this.receiptRenderer.renderReceiptPdf({
      loan: dto,
      organizationName: org?.name ?? 'Bienestar Institucional',
    });

    return {
      code: dto.unitCode,
      pdfBuffer,
    };
  }

  private async enrichLoanDto(organizationId: string, loan: LoanEntity): Promise<LoanDto> {
    const [person, unit, model, point] = await Promise.all([
      this.personGateway.findById(organizationId, loan.personId),
      this.inventoryGateway.findUnitById(organizationId, loan.unitId),
      this.inventoryGateway.findModelById(organizationId, loan.modelId),
      loan.lendingPointId
        ? this.repository.findLendingPointById(organizationId, loan.lendingPointId)
        : Promise.resolve(null),
    ]);

    return {
      id: loan.id,
      organizationId: loan.organizationId,
      siteId: loan.siteId,
      lendingPointId: loan.lendingPointId,
      lendingPointName: point?.name ?? 'Punto Principal',
      personId: loan.personId,
      borrowerName: person?.fullName ?? 'Participante',
      maskedDocument: person ? maskDocumentNumber(person.documentNumber) : '•••0000',
      borrowerEmail: person?.email ?? null,
      unitId: loan.unitId,
      unitCode: unit?.code ?? 'IMP-000',
      unitQrToken: unit?.qrToken ?? '',
      modelId: loan.modelId,
      modelName: model?.name ?? 'Implemento',
      status: loan.status,
      conditionOut: loan.conditionOut,
      conditionIn: loan.conditionIn,
      signatureSha256: loan.signatureSha256,
      dueAt: loan.dueAt.toISOString(),
      deliveredAt: loan.deliveredAt ? loan.deliveredAt.toISOString() : null,
      returnedAt: loan.returnedAt ? loan.returnedAt.toISOString() : null,
      returnNotes: loan.returnNotes,
      createdAt: loan.createdAt.toISOString(),
    };
  }
}
