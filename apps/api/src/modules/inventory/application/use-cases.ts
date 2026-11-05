import type {
  BulkCreateUnitsRequest,
  CreateInventoryCategoryRequest,
  CreateItemModelRequest,
  GenerateUnitLabelsPdfRequest,
  InventoryCategoryDto,
  InventoryUnitDto,
  ItemModelDto,
  UnitCondition,
  UnitStatus,
  UpdateUnitStatusRequest,
} from '@tap/contracts';
import {
  ForbiddenError,
  NotFoundError,
  type AuditLog,
  type Clock,
  type IdGenerator,
  type TenantContext,
} from '../../../shared/index.ts';
import type { Organization } from '../../organizations/index.ts';
import {
  assertValidManualUnitStatusTransition,
  formatUnitCode,
  type InventoryCategoryEntity,
  type InventoryUnitEntity,
  type ItemModelEntity,
} from '../domain/entities.ts';
import type { InventoryRepository, UnitLabelsRenderer } from '../domain/ports.ts';

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
      'Solo administradores u operadores pueden modificar el inventario institucional.',
    );
  }
  return orgId;
}

function toCategoryDto(cat: InventoryCategoryEntity): InventoryCategoryDto {
  return {
    id: cat.id,
    organizationId: cat.organizationId,
    name: cat.name,
    defaultLoanDurationHours: cat.defaultLoanDurationHours,
    maxUnitsPerBorrower: cat.maxUnitsPerBorrower,
    createdAt: cat.createdAt.toISOString(),
  };
}

export class InventoryService {
  private readonly repository: InventoryRepository;
  private readonly labelsRenderer: UnitLabelsRenderer;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;
  private readonly auditLog: AuditLog;
  private readonly findOrganizationById: (organizationId: string) => Promise<Organization | null>;
  private readonly assertFeatureEnabled: (
    organizationId: string,
    feature: 'loans',
  ) => Promise<void>;

  public constructor(deps: {
    repository: InventoryRepository;
    labelsRenderer: UnitLabelsRenderer;
    idGenerator: IdGenerator;
    clock: Clock;
    auditLog: AuditLog;
    findOrganizationById: (organizationId: string) => Promise<Organization | null>;
    assertFeatureEnabled: (organizationId: string, feature: 'loans') => Promise<void>;
  }) {
    this.repository = deps.repository;
    this.labelsRenderer = deps.labelsRenderer;
    this.idGenerator = deps.idGenerator;
    this.clock = deps.clock;
    this.auditLog = deps.auditLog;
    this.findOrganizationById = deps.findOrganizationById;
    this.assertFeatureEnabled = deps.assertFeatureEnabled;
  }

  public async listCategories(actor: StaffActor): Promise<InventoryCategoryDto[]> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'loans');
    const rows = await this.repository.listCategoriesByOrganization(orgId);
    return rows.map(toCategoryDto);
  }

  public async createCategory(
    actor: StaffActor,
    input: CreateInventoryCategoryRequest,
  ): Promise<InventoryCategoryDto> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'loans');
    const created = await this.repository.createCategory({
      id: this.idGenerator.nextId(),
      organizationId: orgId,
      name: input.name.trim(),
      defaultLoanDurationHours: input.defaultLoanDurationHours,
      maxUnitsPerBorrower: input.maxUnitsPerBorrower,
      createdAt: this.clock.now(),
    });
    return toCategoryDto(created);
  }

  public async listModels(actor: StaffActor): Promise<ItemModelDto[]> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'loans');
    return this.listModelsInternal(orgId);
  }

  public async listModelsInternal(organizationId: string): Promise<ItemModelDto[]> {
    const [categories, models, units] = await Promise.all([
      this.repository.listCategoriesByOrganization(organizationId),
      this.repository.listModelsByOrganization(organizationId),
      this.repository.listUnitsByOrganization(organizationId),
    ]);

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    return models.map((model) => {
      const modelUnits = units.filter((u) => u.modelId === model.id);
      const availableUnitsCount = modelUnits.filter((u) => u.status === 'available').length;
      const loanedUnitsCount = modelUnits.filter((u) => u.status === 'loaned').length;
      const category = categoryMap.get(model.categoryId);

      return {
        id: model.id,
        organizationId: model.organizationId,
        categoryId: model.categoryId,
        categoryName: category?.name ?? 'General',
        name: model.name,
        codePrefix: model.codePrefix,
        description: model.description,
        trackingType: model.trackingType,
        loanDurationHours: model.loanDurationHours,
        availableUnitsCount,
        loanedUnitsCount,
        totalUnitsCount: modelUnits.length,
        createdAt: model.createdAt.toISOString(),
      };
    });
  }

  public async createModel(
    actor: StaffActor,
    input: CreateItemModelRequest,
  ): Promise<ItemModelDto> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'loans');

    const category = await this.repository.findCategoryById(orgId, input.categoryId);
    if (!category) {
      throw new NotFoundError('No se encontró la categoría seleccionada.');
    }

    const created: ItemModelEntity = await this.repository.createModel({
      id: this.idGenerator.nextId(),
      organizationId: orgId,
      categoryId: category.id,
      name: input.name.trim(),
      codePrefix: input.codePrefix.trim().toUpperCase(),
      description: input.description ?? null,
      trackingType: input.trackingType,
      loanDurationHours: input.loanDurationHours ?? category.defaultLoanDurationHours,
      createdAt: this.clock.now(),
    });

    return {
      id: created.id,
      organizationId: created.organizationId,
      categoryId: created.categoryId,
      categoryName: category.name,
      name: created.name,
      codePrefix: created.codePrefix,
      description: created.description,
      trackingType: created.trackingType,
      loanDurationHours: created.loanDurationHours,
      availableUnitsCount: 0,
      loanedUnitsCount: 0,
      totalUnitsCount: 0,
      createdAt: created.createdAt.toISOString(),
    };
  }

  public async listUnits(
    actor: StaffActor,
    filters?: { modelId?: string; status?: UnitStatus },
  ): Promise<InventoryUnitDto[]> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'loans');
    return this.listUnitsInternal(orgId, filters);
  }

  public async listUnitsInternal(
    organizationId: string,
    filters?: { modelId?: string; status?: UnitStatus },
  ): Promise<InventoryUnitDto[]> {
    const [categories, models, units] = await Promise.all([
      this.repository.listCategoriesByOrganization(organizationId),
      this.repository.listModelsByOrganization(organizationId),
      this.repository.listUnitsByOrganization(organizationId, filters),
    ]);

    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    const modelMap = new Map(models.map((m) => [m.id, m]));

    return units.map((unit) => {
      const model = modelMap.get(unit.modelId);
      const category = model ? categoryMap.get(model.categoryId) : undefined;
      return {
        id: unit.id,
        organizationId: unit.organizationId,
        siteId: unit.siteId,
        modelId: unit.modelId,
        modelName: model?.name ?? 'Implemento',
        categoryName: category?.name ?? 'General',
        code: unit.code,
        qrToken: unit.qrToken,
        condition: unit.condition,
        status: unit.status,
        notes: unit.notes,
        createdAt: unit.createdAt.toISOString(),
      };
    });
  }

  public async bulkCreateUnits(
    actor: StaffActor,
    modelId: string,
    input: BulkCreateUnitsRequest,
  ): Promise<InventoryUnitDto[]> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'loans');

    const model = await this.repository.findModelById(orgId, modelId);
    if (!model) {
      throw new NotFoundError('No se encontró el modelo de implemento solicitado.');
    }

    const category = await this.repository.findCategoryById(orgId, model.categoryId);
    const now = this.clock.now();

    const unitsToCreate: InventoryUnitEntity[] = [];
    for (let i = 0; i < input.quantity; i += 1) {
      const seq = input.startNumber + i;
      const code = formatUnitCode(model.codePrefix, seq);
      const qrToken = `UNIT-${this.idGenerator.publicCode(10)}`;
      unitsToCreate.push({
        id: this.idGenerator.nextId(),
        organizationId: orgId,
        siteId: input.siteId,
        modelId: model.id,
        code,
        qrToken,
        condition: input.condition,
        status: 'available',
        notes: null,
        version: 1,
        createdAt: now,
      });
    }

    const created = await this.repository.insertUnitsBulk(unitsToCreate);

    return created.map((unit) => ({
      id: unit.id,
      organizationId: unit.organizationId,
      siteId: unit.siteId,
      modelId: unit.modelId,
      modelName: model.name,
      categoryName: category?.name ?? 'General',
      code: unit.code,
      qrToken: unit.qrToken,
      condition: unit.condition,
      status: unit.status,
      notes: unit.notes,
      createdAt: unit.createdAt.toISOString(),
    }));
  }

  public async updateUnitStatus(
    actor: StaffActor,
    unitId: string,
    input: UpdateUnitStatusRequest,
  ): Promise<InventoryUnitDto> {
    const orgId = assertOperatorOrAdmin(actor);
    await this.assertFeatureEnabled(orgId, 'loans');

    const existing = await this.repository.findUnitById(orgId, unitId);
    if (!existing) {
      throw new NotFoundError('No se encontró la unidad de inventario solicitada.');
    }

    assertValidManualUnitStatusTransition(existing.status, input.status);

    const updated = await this.repository.updateUnitStatus({
      organizationId: orgId,
      unitId,
      status: input.status,
      condition: input.condition,
      notes: input.notes,
    });

    if (!updated) {
      throw new NotFoundError('No se pudo actualizar la unidad de inventario.');
    }

    await this.auditLog.record({
      organizationId: orgId,
      actorUserId: actor.userId,
      action: 'inventory.unit_status_changed',
      targetType: 'inventory_unit',
      targetId: updated.id,
      metadata: {
        code: updated.code,
        previousStatus: existing.status,
        newStatus: updated.status,
        condition: updated.condition,
      },
    });

    const model = await this.repository.findModelById(orgId, updated.modelId);
    const category = model ? await this.repository.findCategoryById(orgId, model.categoryId) : null;

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      siteId: updated.siteId,
      modelId: updated.modelId,
      modelName: model?.name ?? 'Implemento',
      categoryName: category?.name ?? 'General',
      code: updated.code,
      qrToken: updated.qrToken,
      condition: updated.condition,
      status: updated.status,
      notes: updated.notes,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  public async generateLabelsPdf(
    actor: StaffActor,
    input: GenerateUnitLabelsPdfRequest,
  ): Promise<Buffer> {
    const orgId = assertStaffOrganization(actor);
    await this.assertFeatureEnabled(orgId, 'loans');

    const [org, models, allUnits] = await Promise.all([
      this.findOrganizationById(orgId),
      this.repository.listModelsByOrganization(orgId),
      this.repository.listUnitsByOrganization(orgId, { modelId: input.modelId }),
    ]);

    const modelMap = new Map(models.map((m) => [m.id, m.name]));
    const unitIdSet = input.unitIds && input.unitIds.length > 0 ? new Set(input.unitIds) : null;

    const targetUnits = unitIdSet
      ? allUnits.filter((u) => unitIdSet.has(u.id))
      : allUnits.slice(0, 36);

    if (targetUnits.length === 0) {
      throw new NotFoundError('No se encontraron unidades para generar etiquetas QR.');
    }

    return this.labelsRenderer.renderLabelsPdf(
      targetUnits.map((unit) => ({
        unit,
        modelName: modelMap.get(unit.modelId) ?? 'Implemento',
        organizationName: org?.name ?? 'Bienestar Institucional',
      })),
    );
  }

  // Fachadas internas para el módulo `loans`
  public async claimAvailableUnitForLoanInternal(params: {
    organizationId: string;
    modelId: string;
    siteId?: string;
  }): Promise<{ unit: InventoryUnitEntity; model: ItemModelEntity } | null> {
    const model = await this.repository.findModelById(params.organizationId, params.modelId);
    if (!model) return null;

    const unit = await this.repository.claimAvailableUnitForLoan(params);
    if (!unit) return null;

    return { unit, model };
  }

  public async releaseUnitFromLoanInternal(params: {
    organizationId: string;
    unitId: string;
    conditionIn: UnitCondition;
    notes?: string | null;
  }): Promise<InventoryUnitEntity | null> {
    return this.repository.releaseUnitFromLoan(params);
  }

  public async findUnitByQrOrCodeInternal(
    organizationId: string,
    qrOrCode: string,
  ): Promise<InventoryUnitEntity | null> {
    return this.repository.findUnitByQrOrCode(organizationId, qrOrCode);
  }

  public async findUnitByIdInternal(
    organizationId: string,
    unitId: string,
  ): Promise<InventoryUnitEntity | null> {
    return this.repository.findUnitById(organizationId, unitId);
  }

  public async findModelByIdInternal(
    organizationId: string,
    modelId: string,
  ): Promise<ItemModelEntity | null> {
    return this.repository.findModelById(organizationId, modelId);
  }
}
