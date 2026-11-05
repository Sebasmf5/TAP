# Módulo `inventory` (Fase 5)

## 1. Propósito y Frontera

El módulo `inventory` administra el esquema PostgreSQL `inventory.*` (`categories`, `item_models` y `units`) y publica la vista de lectura `inventory.v_pub_inventory_summary`.

Gestiona:

- **Categorías de implementos** con plazo de préstamo por defecto (`default_loan_duration_hours`) y límite simultáneo por prestatario.
- **Catálogo de modelos** (`item_models`) con prefijo único de código por entidad (`BAL`, `RAQ`, `AJE`) y conteos en tiempo real de unidades disponibles, prestadas y totales.
- **Alta masiva de unidades físicas** (`POST /api/v1/inventory/models/:modelId/units/bulk`) generando códigos consecutivos (`BAL-001`..`BAL-020`) y tokens QR únicos (`UNIT-...`).
- **Reserva y liberación atómica** (`claimAvailableUnitForLoan`) ejecutando `UPDATE inventory.units SET status = 'loaned' WHERE id = (SELECT id ... WHERE status = 'available' FOR UPDATE SKIP LOCKED) RETURNING *`, garantizando que dos solicitudes simultáneas por la última unidad nunca asignen el mismo implemento.
- **Generación de etiquetas QR imprimibles en PDF** (`POST /api/v1/inventory/units/labels-pdf`) con `pdfkit` y `qrcode`.
