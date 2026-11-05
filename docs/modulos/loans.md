# Módulo `loans` (Fase 5)

## 1. Propósito y Frontera

El módulo `loans` administra el esquema PostgreSQL `loans.*` (`lending_points` y `loans`) y publica la vista `loans.v_pub_loans`.

Gestiona:

- **Puntos de préstamo** con código público (`/p/:code`, por defecto `/p/PREST1` en la semilla de demostración).
- **Flujo público de solicitud de préstamo sin cuenta** (`/p/:code`):
  1. **Bloqueo por Ley 1581**: la interfaz mantiene deshabilitado (`disabled`) el formulario hasta que el participante marca la casilla de aceptación del tratamiento de datos personales.
  2. **Identificación y privacidad**: el endpoint `/lookup` devuelve solo nombre abreviado (`Juan P.`), documento enmascarado (`•••1234`) y elegibilidad (`eligible`).
  3. **Política de elegibilidad y plazo (`Strategy`)**: `DefaultBorrowerEligibilityStrategy` bloquea nuevos préstamos si la persona registra préstamos en mora (`overdue`).
  4. **Idempotencia y firma digital**: exige la cabecera `Idempotency-Key`, almacena la firma digital (`signature_pad`) en `FileStorage` fuera de carpetas públicas y registra su huella `signature_sha256`.
- **Devolución rápida y seguimiento de mora**:
  - Devolución por ID (`POST /api/v1/loans/:id/return`) o escaneando/escribiendo el código o QR de la unidad (`POST /api/v1/loans/return-by-qr`).
  - Barrido de mora (`POST /api/v1/loans/sweep-overdue`) que transiciona préstamos vencidos a `overdue` y publica `loan.overdue` para envío automático de correo.
