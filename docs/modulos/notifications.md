# Módulo `notifications` (Fase 4)

## 1. Propósito y Frontera

El módulo `notifications` es dueño del esquema PostgreSQL `notifications.*` (`templates` y `notifications`) y expone la vista de lectura `notifications.v_pub_notifications`.

Se encarga del encolado, envío, trazabilidad y reintento de notificaciones salientes por entidad mediante los patrones **Strategy + Adapter** (`NotificationChannel` implementado por `EmailNotificationChannel` con `nodemailer` hacia Mailpit/SMTP y `LogNotificationChannel`).

## 2. Flujo Asíncrono y Deduplicación

1. **Desacoplamiento mediante eventos y cola de trabajos**:
   - Cuando `certificates` emite un certificado, publica el evento de dominio `certificate.issued`.
   - `notifications` escucha `certificate.issued`, registra la notificación con estado `pending` y encola un trabajo en `JobQueue` (`notifications.deliver`).
   - El worker procesa el envío en segundo plano sin bloquear la petición HTTP y, al entregar un certificado, notifica el timestamp de entrega (`delivered_at`).
2. **Idempotencia por `deduplication_key`**:
   - La restricción única `(organization_id, deduplication_key)` evita que reintentos del bus o emisiones concurrentes dupliquen correos al mismo destinatario para la misma operación.
3. **Trazabilidad y Reintento Manual**:
   - Si el servidor SMTP falla, la notificación pasa a `failed`, incrementa `attempts` y guarda `last_error`.
   - Un operador o administrador puede invocar `POST /api/v1/notifications/:id/retry`, lo cual reejecuta el envío y deja constancia en `AuditLog`.

## 3. Rutas HTTP (`/api/v1`)

| Método | Ruta                       | Rol mínimo | Descripción                                                                         |
| ------ | -------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `GET`  | `/notifications`           | `viewer`   | Lista notificaciones de la entidad con filtro opcional por `status` o `templateKey` |
| `POST` | `/notifications/:id/retry` | `operator` | Reintenta una notificación fallida o pendiente y registra auditoría                 |
