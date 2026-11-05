# ADR 0004: Certificados PDF Verificables y Notificaciones Desacopladas (Fase 4)

- **Estado:** Aceptado
- **Fecha:** 2026-11-04

## Contexto

La Fase 4 requiere emitir certificados de participación verificables públicamente sin navegador headless, aplicando reglas configurables de elegibilidad por evento, garantizando idempotencia en emisiones en lote y enviando notificaciones por correo en segundo plano con trazabilidad de fallos y reintentos.

## Decisiones

1. **Generación de PDF sin navegador headless (`pdfkit` + `qrcode`)**:
   - Se implementó `PdfKitCertificateRenderer` detrás del puerto `CertificatePdfRenderer`.
   - El documento A4 se genera en memoria con tipografías estándar embebidas (`Helvetica`), código QR en PNG generado con `qrcode` apuntando a `${APP_URL}/v/${code}` y cálculo inmediato de huella SHA-256 (`pdf_sha256`), persistiéndose mediante el puerto `FileStorage`.
2. **Código público de 12 caracteres con dígito verificador Luhn mod 31**:
   - Para detectar errores de digitación antes de consultar la base de datos o distinguir códigos mal formados, los primeros 11 caracteres se generan con entropía criptográfica sobre el alfabeto sin ambigüedades (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`) y el 12.º carácter es el dígito de control Luhn mod 31.
3. **Estrategia de elegibilidad e idempotencia parcial en PostgreSQL**:
   - Se implementó el patrón `EligibilityStrategy` (`AnyAttendanceStrategy`, `MinSessionsStrategy`, `MinAttendancePercentStrategy`, `NoCertificateStrategy`).
   - En PostgreSQL, el índice único parcial `uq_certificates_event_person_active ON certificates.certificates (event_id, person_id) WHERE status = 'issued'` impide duplicados activos por evento y permite reemitir únicamente si un certificado previo fue revocado.
4. **Verificación pública respetuosa de la Ley 1581 de 2012**:
   - El endpoint `GET /api/v1/public/certificates/verify/:code` devuelve el estado (`valid`, `revoked`, `not_found`), nombre del titular, evento, intensidad horaria, huella SHA-256 y motivo de revocación cuando aplica, pero **jamás** incluye el documento de identidad del titular.
5. **Notificaciones asíncronas con `JobQueue` y `deduplication_key`**:
   - `notifications` se suscribe a `certificate.issued` y encola trabajos en `notifications.deliver`. La restricción única `(organization_id, deduplication_key)` garantiza que cada emisión genere como máximo una notificación automática, mientras que los reenvíos explícitos usan una clave con marca de tiempo auditable.

## Consecuencias

- La generación de un certificado PDF con QR tarda pocos milisegundos y no requiere Chromium en producción.
- Las descargas de PDF por parte del personal autenticado se realizan con `fetch` + `Authorization: Bearer` (`apiDownloadFile`), evitando exponer tokens JWT en URLs.
