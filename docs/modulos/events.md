# Módulo `events` (Eventos, Talleres, Ciclo de Vida y Afiche QR)

## 1. Responsabilidad

Gestiona el ciclo de vida de eventos masivos, cursos/talleres de varias sesiones y clases recurrentes, sus ventanas de check-in, las reglas de elegibilidad para certificados y la generación de códigos QR y afiches A4 en PDF listos para imprimir.

## 2. Modelo de datos (`events.*`)

Esquema propio de PostgreSQL: `events`.

- `events.events`:
  - `id` (UUID v7, PK).
  - `organization_id` (UUID, indexado — aislamiento multi-tenant obligatorio).
  - `site_id` (UUID nullable — referencia por id a `organizations.sites`, validada por la fachada de `organizations`).
  - `public_code` (código público de 8 caracteres sin ambigüedades para `/c/:code`, único).
  - `title`, `description`, `location`.
  - `event_type` (`mass_event | course | recurring_class`).
  - `state` (`draft | published | open | closed | cancelled`).
  - `starts_at`, `ends_at`, `checkin_opens_at`, `checkin_closes_at` (`timestamptz`).
  - `capacity` (`integer` nullable).
  - `allow_unregistered` (`boolean`), `Require_student_code` (`boolean`).
  - `certificate_rule` (`jsonb` — `{ type: 'none' | 'any_attendance' | 'min_sessions' | 'min_percentage', minSessions?, minPercentage? }`).
  - `created_by_user_id` (UUID), `created_at`, `updated_at` (`timestamptz`).
- `events.event_sessions`:
  - `id` (UUID v7, PK).
  - `organization_id` (UUID, indexado).
  - `event_id` (UUID, FK a `events.events` con `ON DELETE CASCADE`).
  - `session_number` (`integer`), `title` (`varchar`), `starts_at`, `ends_at` (`timestamptz`).

## 3. Patrones de diseño aplicados (`AGENTS.md` A6)

1. **Factory Method (`EventFactory`)**:
   - `MassEventCreator`: configura por defecto una única sesión principal, permite asistentes no preinscritos (`allowUnregistered = true`) y asigna ventana de check-in de 30 min antes del inicio hasta el cierre.
   - `CourseEventCreator`: exige mínimo 2 sesiones y configura por defecto regla de certificado `min_percentage` (80 %).
   - `RecurringClassCreator`: genera sesiones semanales o personalizadas con ventana de check-in de 15 min antes del inicio y regla `none` por defecto.
2. **Builder (`EventBuilder`)**:
   - Construye el agregado `Event` paso a paso (metadatos, ventana de check-in, sesiones y regla de certificado) y en `build()` verifica todas las invariantes de dominio:
     - `endsAt > startsAt` y `checkinClosesAt > checkinOpensAt`.
     - Todo evento tiene al menos una sesión con `endsAt > startsAt`.
     - Un `course` tiene mínimo 2 sesiones.
     - Si la regla es `min_sessions`, `minSessions <= sessions.length`.
3. **State (`transitionEventState`, `assertEventEditable`)**:
   - Tabla explícita de transiciones permitidas:
     - `draft → published | cancelled`
     - `published → open | cancelled`
     - `open → closed | cancelled`
     - `closed → (terminal)`
     - `cancelled → (terminal)`
   - Emite el evento de dominio correspondiente (`event.published`, `event.opened`, `event.closed`, `event.cancelled`) al confirmar la transacción.
   - Un evento en estado `closed` o `cancelled` es inmutable (`assertEventEditable`).
4. **Prototype (`event.duplicate(...)`)**:
   - Crea una copia en estado `draft` con nuevo `id`, nuevo `publicCode`, nuevas sesiones con nuevos `id` y la misma configuración de ventana, cupo y regla de certificado, sin arrastrar asistencias.

## 4. Apertura y cierre programados

- `EventsService.processScheduledLifecycleTransitions()` evalúa los eventos en `published` cuya ventana `checkinOpensAt <= now < checkinClosesAt` (transicionando a `open`) y los eventos en `open` con `checkinClosesAt <= now` (transicionando a `closed`), publicando los eventos de dominio `event.opened` y `event.closed`.

## 5. Rutas HTTP (`/api/v1/events`)

- `GET /api/v1/events?state=&eventType=&search=` — Lista eventos de la entidad.
- `POST /api/v1/events` — Crea un evento mediante `EventFactory` + `EventBuilder` (`org_admin`, `operator`).
- `GET /api/v1/events/:id` — Detalle del evento y sus sesiones.
- `PATCH /api/v1/events/:id` — Edita un evento no cerrado/cancelado (`org_admin`, `operator`).
- `POST /api/v1/events/:id/{publish|open|close|cancel}` — Ejecuta transiciones del patrón `State`.
- `POST /api/v1/events/:id/duplicate` — Duplica el evento con el patrón `Prototype`.
- `GET /api/v1/events/:id/qr` — Devuelve URL pública `/c/:code`, PNG Data URL y SVG del QR.
- `GET /api/v1/events/:id/poster.pdf` — Genera y descarga con `Authorization: Bearer` el afiche A4 en PDF (`pdfkit` + `qrcode`).
