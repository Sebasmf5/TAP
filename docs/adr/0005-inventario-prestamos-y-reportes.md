# ADR 0005: Reserva Atómica de Inventario, Préstamos con Firma Digital y Reportes Multiformato (Fases 5 y 6)

- **Estado:** Aceptado
- **Fecha:** 2026-11-05

## Contexto

El prototipo requiere soportar solicitudes públicas concurrentes de préstamo de implementos desde celulares (`/p/:code`) sin doble asignación de unidades físicas, con bloqueo obligatorio de autorización de datos (Ley 1581), captura de firma digital manuscrita, seguimiento de mora y exportación de reportes en CSV, Excel y PDF.

## Decisiones

1. **Reserva atómica en PostgreSQL (`FOR UPDATE SKIP LOCKED`)**:
   - En `DrizzleInventoryRepository.claimAvailableUnitForLoan`, la selección y cambio de estado de la unidad disponible se realiza en una sola sentencia `UPDATE "inventory"."units" SET status = 'loaned', version = version + 1 WHERE id = (SELECT id FROM "inventory"."units" WHERE ... AND status = 'available' ORDER BY code ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`.
   - Esto evita condiciones de carrera cuando múltiples participantes solicitan el último implemento al mismo tiempo.
2. **Idempotencia obligatoria y firma con huella SHA-256**:
   - `POST /api/v1/public/lending-points/:code/loans` exige `Idempotency-Key` con índice único `(organization_id, idempotency_key)`.
   - El trazo de `signature_pad` se almacena mediante `FileStorage` fuera de directorios estáticos y su hash `signature_sha256` queda en el préstamo y en el comprobante PDF.
3. **Exportación síncrona en memoria para CSV, XLSX y PDF con control de privacidad**:
   - Se utilizan `csv-stringify`, `exceljs` y `pdfkit` para generar los archivos al vuelo con enmascarado de documentos por defecto (`•••1234`) y registro en `AuditLog` cuando `org_admin` exporta documentos completos.
