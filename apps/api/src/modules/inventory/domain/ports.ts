import type { UnitCondition, UnitStatus } from '@tap/contracts';
import type { InventoryCategoryEntity, InventoryUnitEntity, ItemModelEntity } from './entities.ts';

export interface UnitLabelItem {
  unit: InventoryUnitEntity;
  modelName: string;
  organizationName: string;
}

export interface UnitLabelsRenderer {
  renderLabelsPdf(items: UnitLabelItem[]): Promise<Buffer>;
}

export interface InventoryRepository {
  listCategoriesByOrganization(organizationId: string): Promise<InventoryCategoryEntity[]>;
  findCategoryById(
    organizationId: string,
    categoryId: string,
  ): Promise<InventoryCategoryEntity | null>;
  createCategory(category: InventoryCategoryEntity): Promise<InventoryCategoryEntity>;

  listModelsByOrganization(organizationId: string): Promise<ItemModelEntity[]>;
  findModelById(organizationId: string, modelId: string): Promise<ItemModelEntity | null>;
  createModel(model: ItemModelEntity): Promise<ItemModelEntity>;

  listUnitsByOrganization(
    organizationId: string,
    filters?: { modelId?: string; status?: UnitStatus; siteId?: string },
  ): Promise<InventoryUnitEntity[]>;
  findUnitById(organizationId: string, unitId: string): Promise<InventoryUnitEntity | null>;
  findUnitByQrOrCode(organizationId: string, qrOrCode: string): Promise<InventoryUnitEntity | null>;
  insertUnitsBulk(units: InventoryUnitEntity[]): Promise<InventoryUnitEntity[]>;
  updateUnitStatus(params: {
    organizationId: string;
    unitId: string;
    status: UnitStatus;
    condition?: UnitCondition;
    notes?: string | null;
  }): Promise<InventoryUnitEntity | null>;

  /**
   * Reserva y marca como prestada de forma atómica una unidad disponible del modelo indicado.
   * Si dos solicitudes compiten por la última unidad, solo una obtiene la fila y la otra recibe `null`.
   */
  claimAvailableUnitForLoan(params: {
    organizationId: string;
    modelId: string;
    siteId?: string;
  }): Promise<InventoryUnitEntity | null>;

  releaseUnitFromLoan(params: {
    organizationId: string;
    unitId: string;
    conditionIn: UnitCondition;
    notes?: string | null;
  }): Promise<InventoryUnitEntity | null>;
}
