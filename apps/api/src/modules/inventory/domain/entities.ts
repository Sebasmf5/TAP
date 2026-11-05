import type { ItemTrackingType, UnitCondition, UnitStatus } from '@tap/contracts';
import { ConflictError } from '../../../shared/index.ts';

export interface InventoryCategoryEntity {
  id: string;
  organizationId: string;
  name: string;
  defaultLoanDurationHours: number;
  maxUnitsPerBorrower: number;
  createdAt: Date;
}

export interface ItemModelEntity {
  id: string;
  organizationId: string;
  categoryId: string;
  name: string;
  codePrefix: string;
  description: string | null;
  trackingType: ItemTrackingType;
  loanDurationHours: number;
  createdAt: Date;
}

export interface InventoryUnitEntity {
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
  createdAt: Date;
}

const ALLOWED_MANUAL_STATUS_TRANSITIONS: Record<UnitStatus, ReadonlyArray<UnitStatus>> = {
  available: ['maintenance', 'retired', 'lost'],
  reserved: ['available', 'loaned', 'maintenance'],
  loaned: ['available', 'lost', 'maintenance'],
  maintenance: ['available', 'retired'],
  retired: ['available'],
  lost: ['available', 'retired'],
};

export function assertValidManualUnitStatusTransition(from: UnitStatus, to: UnitStatus): void {
  if (from === to) return;
  const allowed = ALLOWED_MANUAL_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ConflictError(
      `Transición de estado de inventario no permitida: de «${from}» a «${to}».`,
    );
  }
}

export function formatUnitCode(prefix: string, sequenceNumber: number): string {
  const normalizedPrefix = prefix
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const padded = String(sequenceNumber).padStart(3, '0');
  return `${normalizedPrefix}-${padded}`;
}
