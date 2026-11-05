# Pendientes y notas de cumplimiento

## 1. Revisión jurídica obligatoria (Ley 1581 de 2012 y firma electrónica)

- **Tratamiento de datos personales (Ley 1581 de 2012 y decretos reglamentarios):** el texto de autorización versionado, el flujo de aceptación previa obligatoria, el manejo de datos de menores de edad con acudiente y la política de retención (`retention_days`) implementados en el prototipo **requieren revisión y validación por parte de un asesor jurídico** antes de su uso con datos reales (`AGENTS.md` A7.4).
- **Firma electrónica simple en préstamos (Ley 527 de 1999 / Decreto 2364 de 2012):** la captura de trazo en lienzo vinculada al consentimiento, marca de tiempo, hash SHA-256 de la imagen, versión del texto aceptado, user agent y hash de IP constituye una firma electrónica simple; su validez probatoria y redacción contractual **requieren revisión de un asesor jurídico** (`docs/especificacion.md` B1.8).

## 2. Borrado o anonimización automática por `retention_days`

- El campo `retention_days` está modelado en `organizations.organizations` desde la Fase 0. El trabajo programado de purga/anonimización automática al vencer dicho plazo queda registrado como pendiente documentado conforme a `AGENTS.md` A7.4.

## 3. Verificación de Docker Desktop y PostgreSQL 17

- Las pruebas de integración (`pnpm --filter @tap/api run test:integration`) y las pruebas de extremo a extremo (`pnpm test:e2e`) se ejecutan contra contenedores reales de `postgres:17-alpine` mediante Testcontainers, aplicando automáticamente las migraciones `0000` a `0005` y verificando la persistencia, el aislamiento multi-tenant y la idempotencia en todos los módulos.
