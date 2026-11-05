import type { ItemTrackingType, UnitCondition, UnitStatus } from '@tap/contracts';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { ConflictError, type DrizzleExecutor } from '../../../shared/index.ts';
import type {
  InventoryCategoryEntity,
  InventoryUnitEntity,
  ItemModelEntity,
} from '../domain/entities.ts';
import type { InventoryRepository } from '../domain/ports.ts';
import { inventoryCategoriesTable, itemModelsTable, unitsTable } from './schema.ts';

function mapCategoryRow(
  row: typeof inventoryCategoriesTable.$inferSelect,
): InventoryCategoryEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    defaultLoanDurationHours: row.defaultLoanDurationHours,
    maxUnitsPerBorrower: row.maxUnitsPerBorrower,
    createdAt: row.createdAt,
  };
}

function mapModelRow(row: typeof itemModelsTable.$inferSelect): ItemModelEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    categoryId: row.categoryId,
    name: row.name,
    codePrefix: row.codePrefix,
    description: row.description ?? null,
    trackingType: (row.trackingType as ItemTrackingType) ?? 'trackable',
    loanDurationHours: row.loanDurationHours,
    createdAt: row.createdAt,
  };
}

function mapUnitRow(row: typeof unitsTable.$inferSelect): InventoryUnitEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    siteId: row.siteId,
    modelId: row.modelId,
    code: row.code,
    qrToken: row.qrToken,
    condition: row.condition as UnitCondition,
    status: row.status as UnitStatus,
    notes: row.notes ?? null,
    version: row.version,
    createdAt: row.createdAt,
  };
}

export class DrizzleInventoryRepository implements InventoryRepository {
  private readonly db: DrizzleExecutor;

  public constructor(db: DrizzleExecutor) {
    this.db = db;
  }

  public async listCategoriesByOrganization(
    organizationId: string,
  ): Promise<InventoryCategoryEntity[]> {
    const rows = await this.db
      .select()
      .from(inventoryCategoriesTable)
      .where(eq(inventoryCategoriesTable.organizationId, organizationId))
      .orderBy(asc(inventoryCategoriesTable.name));
    return rows.map(mapCategoryRow);
  }

  public async findCategoryById(
    organizationId: string,
    categoryId: string,
  ): Promise<InventoryCategoryEntity | null> {
    const [row] = await this.db
      .select()
      .from(inventoryCategoriesTable)
      .where(
        and(
          eq(inventoryCategoriesTable.organizationId, organizationId),
          eq(inventoryCategoriesTable.id, categoryId),
        ),
      )
      .limit(1);
    return row ? mapCategoryRow(row) : null;
  }

  public async createCategory(category: InventoryCategoryEntity): Promise<InventoryCategoryEntity> {
    const [inserted] = await this.db
      .insert(inventoryCategoriesTable)
      .values({
        id: category.id,
        organizationId: category.organizationId,
        name: category.name,
        defaultLoanDurationHours: category.defaultLoanDurationHours,
        maxUnitsPerBorrower: category.maxUnitsPerBorrower,
        createdAt: category.createdAt,
      })
      .returning();
    return mapCategoryRow(inserted!);
  }

  public async listModelsByOrganization(organizationId: string): Promise<ItemModelEntity[]> {
    const rows = await this.db
      .select()
      .from(itemModelsTable)
      .where(eq(itemModelsTable.organizationId, organizationId))
      .orderBy(asc(itemModelsTable.name));
    return rows.map(mapModelRow);
  }

  public async findModelById(
    organizationId: string,
    modelId: string,
  ): Promise<ItemModelEntity | null> {
    const [row] = await this.db
      .select()
      .from(itemModelsTable)
      .where(
        and(eq(itemModelsTable.organizationId, organizationId), eq(itemModelsTable.id, modelId)),
      )
      .limit(1);
    return row ? mapModelRow(row) : null;
  }

  public async createModel(model: ItemModelEntity): Promise<ItemModelEntity> {
    const [inserted] = await this.db
      .insert(itemModelsTable)
      .values({
        id: model.id,
        organizationId: model.organizationId,
        categoryId: model.categoryId,
        name: model.name,
        codePrefix: model.codePrefix,
        description: model.description,
        trackingType: model.trackingType,
        loanDurationHours: model.loanDurationHours,
        createdAt: model.createdAt,
      })
      .onConflictDoNothing({
        target: [itemModelsTable.organizationId, itemModelsTable.codePrefix],
      })
      .returning();

    if (!inserted) {
      throw new ConflictError(
        `Ya existe un modelo de inventario con el prefijo «${model.codePrefix}» en la entidad.`,
      );
    }
    return mapModelRow(inserted);
  }

  public async listUnitsByOrganization(
    organizationId: string,
    filters?: { modelId?: string; status?: UnitStatus; siteId?: string },
  ): Promise<InventoryUnitEntity[]> {
    const conditions = [eq(unitsTable.organizationId, organizationId)];
    if (filters?.modelId) {
      conditions.push(eq(unitsTable.modelId, filters.modelId));
    }
    if (filters?.status) {
      conditions.push(eq(unitsTable.status, filters.status));
    }
    if (filters?.siteId) {
      conditions.push(eq(unitsTable.siteId, filters.siteId));
    }

    const rows = await this.db
      .select()
      .from(unitsTable)
      .where(and(...conditions))
      .orderBy(asc(unitsTable.code));
    return rows.map(mapUnitRow);
  }

  public async findUnitById(
    organizationId: string,
    unitId: string,
  ): Promise<InventoryUnitEntity | null> {
    const [row] = await this.db
      .select()
      .from(unitsTable)
      .where(and(eq(unitsTable.organizationId, organizationId), eq(unitsTable.id, unitId)))
      .limit(1);
    return row ? mapUnitRow(row) : null;
  }

  public async findUnitByQrOrCode(
    organizationId: string,
    qrOrCode: string,
  ): Promise<InventoryUnitEntity | null> {
    const normalized = qrOrCode.trim();
    const [row] = await this.db
      .select()
      .from(unitsTable)
      .where(
        and(
          eq(unitsTable.organizationId, organizationId),
          or(eq(unitsTable.qrToken, normalized), eq(unitsTable.code, normalized.toUpperCase())),
        ),
      )
      .limit(1);
    return row ? mapUnitRow(row) : null;
  }

  public async insertUnitsBulk(units: InventoryUnitEntity[]): Promise<InventoryUnitEntity[]> {
    if (units.length === 0) return [];
    const inserted = await this.db
      .insert(unitsTable)
      .values(
        units.map((u) => ({
          id: u.id,
          organizationId: u.organizationId,
          siteId: u.siteId,
          modelId: u.modelId,
          code: u.code,
          qrToken: u.qrToken,
          condition: u.condition,
          status: u.status,
          notes: u.notes,
          version: u.version,
          createdAt: u.createdAt,
        })),
      )
      .onConflictDoNothing({
        target: [unitsTable.organizationId, unitsTable.code],
      })
      .returning();
    return inserted.map(mapUnitRow);
  }

  public async updateUnitStatus(params: {
    organizationId: string;
    unitId: string;
    status: UnitStatus;
    condition?: UnitCondition;
    notes?: string | null;
  }): Promise<InventoryUnitEntity | null> {
    const [updated] = await this.db
      .update(unitsTable)
      .set({
        status: params.status,
        ...(params.condition ? { condition: params.condition } : {}),
        ...(params.notes !== undefined ? { notes: params.notes } : {}),
        version: sql`${unitsTable.version} + 1`,
      })
      .where(
        and(eq(unitsTable.organizationId, params.organizationId), eq(unitsTable.id, params.unitId)),
      )
      .returning();
    return updated ? mapUnitRow(updated) : null;
  }

  public async claimAvailableUnitForLoan(params: {
    organizationId: string;
    modelId: string;
    siteId?: string;
  }): Promise<InventoryUnitEntity | null> {
    // Reserva atómica con UPDATE ... WHERE id = (SELECT ... WHERE status = 'available' FOR UPDATE SKIP LOCKED) RETURNING *
    const siteCondition = params.siteId ? sql`AND site_id = ${params.siteId}::uuid` : sql``;

    const result = await this.db.execute(sql`
      UPDATE "inventory"."units"
      SET status = 'loaned',
          version = version + 1
      WHERE id = (
        SELECT id
        FROM "inventory"."units"
        WHERE organization_id = ${params.organizationId}::uuid
          AND model_id = ${params.modelId}::uuid
          AND status = 'available'
          ${siteCondition}
        ORDER BY code ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        organization_id AS "organizationId",
        site_id AS "siteId",
        model_id AS "modelId",
        code,
        qr_token AS "qrToken",
        condition,
        status,
        notes,
        version,
        created_at AS "createdAt"
    `);

    const row = result.rows[0] as
      | {
          id: string;
          organizationId: string;
          siteId: string;
          modelId: string;
          code: string;
          qrToken: string;
          condition: UnitCondition;
          status: UnitStatus;
          notes: string | null;
          version: number;
          createdAt: Date | string;
        }
      | undefined;

    if (!row) return null;
    return {
      ...row,
      notes: row.notes ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    };
  }

  public async releaseUnitFromLoan(params: {
    organizationId: string;
    unitId: string;
    conditionIn: UnitCondition;
    notes?: string | null;
  }): Promise<InventoryUnitEntity | null> {
    const nextStatus: UnitStatus = params.conditionIn === 'damaged' ? 'maintenance' : 'available';
    return this.updateUnitStatus({
      organizationId: params.organizationId,
      unitId: params.unitId,
      status: nextStatus,
      condition: params.conditionIn,
      notes: params.notes,
    });
  }
}

export class InMemoryInventoryRepository implements InventoryRepository {
  private readonly categories = new Map<string, InventoryCategoryEntity>();
  private readonly models = new Map<string, ItemModelEntity>();
  private readonly units = new Map<string, InventoryUnitEntity>();

  public async listCategoriesByOrganization(
    organizationId: string,
  ): Promise<InventoryCategoryEntity[]> {
    return Array.from(this.categories.values())
      .filter((c) => c.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es-CO'));
  }

  public async findCategoryById(
    organizationId: string,
    categoryId: string,
  ): Promise<InventoryCategoryEntity | null> {
    const cat = this.categories.get(categoryId);
    if (!cat || cat.organizationId !== organizationId) return null;
    return { ...cat };
  }

  public async createCategory(category: InventoryCategoryEntity): Promise<InventoryCategoryEntity> {
    const copy = { ...category };
    this.categories.set(copy.id, copy);
    return { ...copy };
  }

  public async listModelsByOrganization(organizationId: string): Promise<ItemModelEntity[]> {
    return Array.from(this.models.values())
      .filter((m) => m.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es-CO'));
  }

  public async findModelById(
    organizationId: string,
    modelId: string,
  ): Promise<ItemModelEntity | null> {
    const model = this.models.get(modelId);
    if (!model || model.organizationId !== organizationId) return null;
    return { ...model };
  }

  public async createModel(model: ItemModelEntity): Promise<ItemModelEntity> {
    for (const existing of this.models.values()) {
      if (
        existing.organizationId === model.organizationId &&
        existing.codePrefix.toUpperCase() === model.codePrefix.toUpperCase()
      ) {
        throw new ConflictError(
          `Ya existe un modelo de inventario con el prefijo «${model.codePrefix}» en la entidad.`,
        );
      }
    }
    const copy = { ...model };
    this.models.set(copy.id, copy);
    return { ...copy };
  }

  public async listUnitsByOrganization(
    organizationId: string,
    filters?: { modelId?: string; status?: UnitStatus; siteId?: string },
  ): Promise<InventoryUnitEntity[]> {
    return Array.from(this.units.values())
      .filter((u) => {
        if (u.organizationId !== organizationId) return false;
        if (filters?.modelId && u.modelId !== filters.modelId) return false;
        if (filters?.status && u.status !== filters.status) return false;
        if (filters?.siteId && u.siteId !== filters.siteId) return false;
        return true;
      })
      .sort((a, b) => a.code.localeCompare(b.code, 'es-CO'));
  }

  public async findUnitById(
    organizationId: string,
    unitId: string,
  ): Promise<InventoryUnitEntity | null> {
    const unit = this.units.get(unitId);
    if (!unit || unit.organizationId !== organizationId) return null;
    return { ...unit };
  }

  public async findUnitByQrOrCode(
    organizationId: string,
    qrOrCode: string,
  ): Promise<InventoryUnitEntity | null> {
    const normalized = qrOrCode.trim();
    for (const unit of this.units.values()) {
      if (
        unit.organizationId === organizationId &&
        (unit.qrToken === normalized || unit.code.toUpperCase() === normalized.toUpperCase())
      ) {
        return { ...unit };
      }
    }
    return null;
  }

  public async insertUnitsBulk(units: InventoryUnitEntity[]): Promise<InventoryUnitEntity[]> {
    const created: InventoryUnitEntity[] = [];
    for (const unit of units) {
      const duplicate = Array.from(this.units.values()).some(
        (existing) =>
          existing.organizationId === unit.organizationId &&
          existing.code.toUpperCase() === unit.code.toUpperCase(),
      );
      if (duplicate) continue;
      const copy = { ...unit };
      this.units.set(copy.id, copy);
      created.push({ ...copy });
    }
    return created;
  }

  public async updateUnitStatus(params: {
    organizationId: string;
    unitId: string;
    status: UnitStatus;
    condition?: UnitCondition;
    notes?: string | null;
  }): Promise<InventoryUnitEntity | null> {
    const existing = this.units.get(params.unitId);
    if (!existing || existing.organizationId !== params.organizationId) return null;
    const updated: InventoryUnitEntity = {
      ...existing,
      status: params.status,
      condition: params.condition ?? existing.condition,
      notes: params.notes !== undefined ? params.notes : existing.notes,
      version: existing.version + 1,
    };
    this.units.set(updated.id, updated);
    return { ...updated };
  }

  public async claimAvailableUnitForLoan(params: {
    organizationId: string;
    modelId: string;
    siteId?: string;
  }): Promise<InventoryUnitEntity | null> {
    const candidates = Array.from(this.units.values())
      .filter(
        (u) =>
          u.organizationId === params.organizationId &&
          u.modelId === params.modelId &&
          u.status === 'available' &&
          (!params.siteId || u.siteId === params.siteId),
      )
      .sort((a, b) => a.code.localeCompare(b.code, 'es-CO'));

    const chosen = candidates[0];
    if (!chosen) return null;

    const updated: InventoryUnitEntity = {
      ...chosen,
      status: 'loaned',
      version: chosen.version + 1,
    };
    this.units.set(updated.id, updated);
    return { ...updated };
  }

  public async releaseUnitFromLoan(params: {
    organizationId: string;
    unitId: string;
    conditionIn: UnitCondition;
    notes?: string | null;
  }): Promise<InventoryUnitEntity | null> {
    const nextStatus: UnitStatus = params.conditionIn === 'damaged' ? 'maintenance' : 'available';
    return this.updateUnitStatus({
      organizationId: params.organizationId,
      unitId: params.unitId,
      status: nextStatus,
      condition: params.conditionIn,
      notes: params.notes,
    });
  }
}
