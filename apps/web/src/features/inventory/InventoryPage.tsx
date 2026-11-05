import type {
  InventoryCategoryDto,
  InventoryUnitDto,
  ItemModelDto,
  SiteDto,
  UnitStatus,
} from '@tap/contracts';
import { Layers, PackagePlus, QrCode, Wrench } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, apiDownloadFile, apiRequest } from '../../shared/api/http-client.ts';
import { Badge, Button, Card, Input, StatCard } from '../../shared/ui/index.ts';

export function InventoryPage() {
  const [categories, setCategories] = useState<InventoryCategoryDto[]>([]);
  const [models, setModels] = useState<ItemModelDto[]>([]);
  const [units, setUnits] = useState<InventoryUnitDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Formulario de alta masiva de unidades
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [bulkQuantity, setBulkQuantity] = useState('5');
  const [bulkStartNumber, setBulkStartNumber] = useState('3');
  const [creatingBulk, setCreatingBulk] = useState(false);

  // Formulario de nuevo modelo
  const [modelName, setModelName] = useState('');
  const [modelPrefix, setModelPrefix] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [catList, modelList, unitList, siteList] = await Promise.all([
          apiRequest<InventoryCategoryDto[]>('/inventory/categories'),
          apiRequest<ItemModelDto[]>('/inventory/models'),
          apiRequest<InventoryUnitDto[]>('/inventory/units'),
          apiRequest<SiteDto[]>('/organizations/current/sites'),
        ]);
        if (!active) return;
        setCategories(catList);
        setModels(modelList);
        setUnits(unitList);
        if (catList[0] && !selectedCategoryId) setSelectedCategoryId(catList[0].id);
        if (modelList[0] && !selectedModelId) setSelectedModelId(modelList[0].id);
        if (siteList[0] && !selectedSiteId) setSelectedSiteId(siteList[0].id);
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof ApiClientError ? err.detail : 'No se pudo cargar el inventario.',
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [reloadKey, selectedCategoryId, selectedModelId, selectedSiteId]);

  const handleBulkCreateUnits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModelId || !selectedSiteId) return;
    setCreatingBulk(true);
    setFeedback(null);
    setErrorMessage(null);
    try {
      const created = await apiRequest<InventoryUnitDto[]>(
        `/inventory/models/${selectedModelId}/units/bulk`,
        {
          method: 'POST',
          body: {
            siteId: selectedSiteId,
            quantity: Number(bulkQuantity) || 5,
            startNumber: Number(bulkStartNumber) || 1,
            condition: 'good',
          },
        },
      );
      setFeedback(`Alta masiva completada: ${created.length} unidad(es) creada(s) con QR único.`);
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudieron generar las unidades.',
      );
    } finally {
      setCreatingBulk(false);
    }
  };

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId || !modelName.trim() || !modelPrefix.trim()) return;
    setErrorMessage(null);
    try {
      const created = await apiRequest<ItemModelDto>('/inventory/models', {
        method: 'POST',
        body: {
          categoryId: selectedCategoryId,
          name: modelName.trim(),
          codePrefix: modelPrefix.trim().toUpperCase(),
          trackingType: 'trackable',
        },
      });
      setFeedback(`Modelo «${created.name}» (${created.codePrefix}) agregado al catálogo.`);
      setModelName('');
      setModelPrefix('');
      setSelectedModelId(created.id);
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudo crear el modelo de implemento.',
      );
    }
  };

  const handleToggleMaintenance = async (unit: InventoryUnitDto) => {
    const nextStatus: UnitStatus = unit.status === 'maintenance' ? 'available' : 'maintenance';
    try {
      await apiRequest<InventoryUnitDto>(`/inventory/units/${unit.id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      setFeedback(`Unidad ${unit.code} actualizada a estado «${nextStatus}».`);
      reload();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.detail : 'No se pudo cambiar el estado de la unidad.',
      );
    }
  };

  const handleDownloadLabelsPdf = async () => {
    try {
      await apiDownloadFile('/inventory/units/labels-pdf', 'etiquetas_qr_inventario.pdf', {
        method: 'POST',
        body: {},
      });
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError
          ? err.detail
          : 'No se pudo descargar la hoja de etiquetas QR.',
      );
    }
  };

  const availableUnits = units.filter((u) => u.status === 'available').length;
  const loanedUnits = units.filter((u) => u.status === 'loaned').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-normal text-[var(--text-heading)]">
            Catálogo de inventario y unidades QR
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Modelos de implementos, alta masiva de unidades seriadas y etiquetas QR en PDF.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleDownloadLabelsPdf()}
          data-testid="download-labels-pdf-btn"
        >
          <QrCode className="h-4 w-4" aria-hidden="true" />
          Descargar etiquetas QR (PDF)
        </Button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-xs text-[var(--status-danger-text)]"
        >
          {errorMessage}
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className="rounded-[var(--radius-control)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-xs text-[var(--status-success-text)]"
          data-testid="inventory-feedback-banner"
        >
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard
          label="Categorías"
          value={String(categories.length)}
          hint="Con políticas de plazo"
        />
        <StatCard
          label="Modelos en catálogo"
          value={String(models.length)}
          hint="Implementos registrados"
        />
        <StatCard
          label="Unidades disponibles"
          value={String(availableUnits)}
          hint="Listas para préstamo inmediato"
        />
        <StatCard
          label="Unidades en préstamo"
          value={String(loanedUnits)}
          hint="Reservadas atómicamente"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Alta masiva de unidades físicas"
          description="Genera lotes numerados automáticamente (ej: BAL-003 .. BAL-007) con código QR único para cada unidad."
        >
          <form onSubmit={(e) => void handleBulkCreateUnits(e)} className="space-y-4">
            <div>
              <label
                htmlFor="bulk-model-select"
                className="mb-1.5 block text-xs font-medium text-[var(--text-body)]"
              >
                Modelo de implemento
              </label>
              <select
                id="bulk-model-select"
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-heading)]"
                data-testid="bulk-model-select"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.codePrefix})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                id="bulk-quantity-input"
                type="number"
                label="Cantidad de unidades"
                value={bulkQuantity}
                onChange={(e) => setBulkQuantity(e.target.value)}
                data-testid="bulk-quantity-input"
              />
              <Input
                id="bulk-start-input"
                type="number"
                label="Consecutivo inicial"
                value={bulkStartNumber}
                onChange={(e) => setBulkStartNumber(e.target.value)}
                data-testid="bulk-start-input"
              />
            </div>

            {/* Única acción cromática principal por vista (AGENTS.md A9) */}
            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={creatingBulk || !selectedModelId}
              data-testid="bulk-create-units-btn"
            >
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
              {creatingBulk ? 'Generando unidades…' : 'Generar lote de unidades'}
            </Button>
          </form>
        </Card>

        <Card
          title="Agregar modelo al catálogo"
          description="Define el nombre y el prefijo de código para nuevos implementos deportivos o culturales."
        >
          <form onSubmit={(e) => void handleCreateModel(e)} className="space-y-4">
            <Input
              id="new-model-name"
              label="Nombre del modelo"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="Ej: Ajedrez Reglamentario Staunton"
              data-testid="new-model-name"
              required
            />
            <Input
              id="new-model-prefix"
              label="Prefijo de código (2 a 6 letras)"
              value={modelPrefix}
              onChange={(e) => setModelPrefix(e.target.value)}
              placeholder="Ej: AJE"
              data-testid="new-model-prefix"
              required
            />
            <Button type="submit" variant="secondary" fullWidth>
              <Layers className="h-4 w-4" aria-hidden="true" />
              Guardar modelo en catálogo
            </Button>
          </form>
        </Card>
      </div>

      <Card
        title={`Unidades físicas registradas (${units.length})`}
        description="Control individual por código seriado, estado de disponibilidad, condición física y token QR."
      >
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Cargando unidades…</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-left text-xs border-collapse"
              data-testid="inventory-units-table"
            >
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                  <th className="py-2.5 pr-3 font-medium">Código</th>
                  <th className="py-2.5 px-3 font-medium">Modelo</th>
                  <th className="py-2.5 px-3 font-medium">Categoría</th>
                  <th className="py-2.5 px-3 font-medium">Estado</th>
                  <th className="py-2.5 px-3 font-medium">Condición</th>
                  <th className="py-2.5 px-3 font-medium">Token QR</th>
                  <th className="py-2.5 pl-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {units.map((unit) => (
                  <tr key={unit.id} className="hover:bg-[var(--surface-hover)]">
                    <td className="py-2.5 pr-3 font-mono font-semibold text-[var(--text-heading)]">
                      {unit.code}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-heading)]">{unit.modelName}</td>
                    <td className="py-2.5 px-3 text-[var(--text-muted)]">{unit.categoryName}</td>
                    <td className="py-2.5 px-3">
                      {unit.status === 'available' ? (
                        <Badge status="success">Disponible</Badge>
                      ) : unit.status === 'loaned' ? (
                        <Badge status="info">En préstamo</Badge>
                      ) : unit.status === 'maintenance' ? (
                        <Badge status="warning">Mantenimiento</Badge>
                      ) : (
                        <Badge status="danger">{unit.status}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-body)]">{unit.condition}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-muted)]">
                      {unit.qrToken}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      {unit.status !== 'loaned' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleToggleMaintenance(unit)}
                        >
                          <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                          {unit.status === 'maintenance' ? 'Habilitar' : 'Mantenimiento'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
