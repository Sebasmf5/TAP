# Módulo `certificates` (Fase 4)

## 1. Propósito y Frontera

El módulo `certificates` es dueño del esquema PostgreSQL `certificates.*` (`certificate_templates` y `certificates`) y expone la vista pública de lectura `certificates.v_pub_certificates` para reportes estadísticos.

Gestiona:

- **Plantillas versionadas** por entidad (`certificate_templates`) con interpolación de variables (`{{full_name}}`, `{{event_name}}`, `{{date}}`, `{{hours}}`) y configuración de firmantes.
- **Evaluación de elegibilidad** mediante el patrón **Strategy/Specification** (`EligibilityStrategy`: `AnyAttendanceStrategy`, `MinSessionsStrategy`, `MinAttendancePercentStrategy` y `NoCertificateStrategy`).
- **Emisión en lote idempotente** manual (`POST /api/v1/events/:eventId/certificates/issue`) o automática al cierre del evento (`event.closed` cuando `autoIssueCertificates = true`).
- **Generación de PDF A4** con `pdfkit` (`PdfKitCertificateRenderer`), código QR embebido apuntando a `${APP_URL}/v/:code`, código único de 12 caracteres con dígito de control Luhn mod N y huella criptográfica `pdf_sha256`.
- **Verificación pública sin cuenta** (`GET /api/v1/public/certificates/verify/:code` y ruta `/v/:code`), que devuelve autenticidad, titular, actividad, horas y estado (`valid`, `revoked`, `not_found`) **sin exponer jamás el número de documento**.
- **Revocación auditada** (`POST /api/v1/certificates/:id/revoke`) con motivo obligatorio y registro en `AuditLog`.

## 2. Reglas de Dominio e Invariantes

1. **Idempotencia estricta de emisión**: Un participante solo puede tener un certificado activo (`status = 'issued'`) por evento, garantizado por el índice único parcial `uq_certificates_event_person_active` (`ON (event_id, person_id) WHERE status = 'issued'`) y cláusula `ON CONFLICT DO NOTHING`.
2. **Instantánea inmutable**: Al emitir un certificado se persiste `template_snapshot` y `payload` para que futuros cambios en la plantilla de la entidad no alteren certificados históricos.
3. **Código público con dígito de control**: 12 caracteres del alfabeto sin ambigüedades (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), donde los primeros 11 son criptográficamente aleatorios y el 12.º es un dígito verificador Luhn mod 31.

## 3. Rutas HTTP (`/api/v1`)

| Método | Ruta                                     | Rol mínimo  | Descripción                                                        |
| ------ | ---------------------------------------- | ----------- | ------------------------------------------------------------------ |
| `GET`  | `/certificate-templates`                 | `viewer`    | Lista las plantillas de la entidad                                 |
| `POST` | `/certificate-templates`                 | `org_admin` | Crea una nueva versión de plantilla                                |
| `POST` | `/certificate-templates/:id/preview`     | `operator`  | Genera un PDF de vista previa con datos de muestra                 |
| `POST` | `/events/:eventId/certificates/evaluate` | `viewer`    | Evalúa elegibilidad de los asistentes del evento                   |
| `POST` | `/events/:eventId/certificates/issue`    | `operator`  | Emite certificados en lote de forma idempotente                    |
| `GET`  | `/events/:eventId/certificates`          | `viewer`    | Lista los certificados emitidos/revocados del evento               |
| `GET`  | `/certificates/:id/pdf`                  | `viewer`    | Descarga autenticada del PDF (vía `fetch` con `Bearer`)            |
| `POST` | `/certificates/:id/resend`               | `operator`  | Reencola el envío del certificado por correo                       |
| `POST` | `/certificates/:id/revoke`               | `org_admin` | Revoca un certificado con motivo y auditoría                       |
| `GET`  | `/public/certificates/verify/:code`      | Público     | Verifica autenticidad y vigencia e incrementa `verification_count` |
