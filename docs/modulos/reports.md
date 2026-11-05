# Módulo `reports` (Fase 6)

## 1. Propósito y Frontera

El módulo `reports` consolida indicadores estadísticos para el tablero principal (`GET /api/v1/reports/dashboard`) y genera reportes descargables en **CSV** (`csv-stringify`), **Excel `.xlsx`** (`exceljs`) y **PDF** (`pdfkit`) a través de `GET /api/v1/reports/export`.

## 2. Protección de Datos Personales y Auditoría

1. **Enmascarado por defecto (Ley 1581 de 2012)**:
   - Todas las exportaciones realizadas por roles `viewer` u `operator` (y por defecto también para `org_admin`) enmascaran los números de documento (`•••1234`).
2. **Exportación completa restringida y auditada**:
   - Solo un usuario con rol `org_admin` puede solicitar `includeFullDocument=true`. Si otro rol lo intenta, recibe `403 Forbidden`.
   - Cada exportación con documento completo queda registrada en `shared.audit_logs` con la acción `reports.personal_data_exported`.
3. **Descarga segura con JWT en cabecera**:
   - El frontend descarga los archivos mediante `apiDownloadFile` (`fetch` con `Authorization: Bearer` y creación de `Blob`), sin exponer jamás el token JWT en la URL.
