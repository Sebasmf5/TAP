# PARTE B. ESPECIFICACIÓN Y ENCARGO

## B1. Módulos (10)

Orden de dependencias: `shared` → `access`, `organizations` → `people`, `events`, `inventory` → `attendance`, `loans`, `certificates` → `notifications`, `reports`.

### 1. `access` (identidad y roles)

- **Tablas** (`access.*`): `users` (id, organization_id nullable para `platform_admin`, email único por entidad, password_hash, role, status, token_version), `refresh_tokens`, `oauth_accounts`.
- **Casos de uso:** login por contraseña, login Google (opcional), refresh, logout, `me`, cambiar contraseña, crear/editar/deshabilitar usuarios (solo `org_admin`).
- **Rutas:** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/google` y `/callback`, `GET /auth/me`, `POST /auth/change-password`, `GET|POST /users`, `PATCH /users/:id`, `POST /users/:id/disable`.
- **Pantallas:** inicio de sesión (con ambos temas), perfil, gestión de usuarios.
- **Fachada pública:** `verifyAccessToken`, `getUserStatus`, `requireRole`.

### 2. `organizations` (entidades y sedes)

- **Tablas:** `organizations` (nombre, slug, tipo: `ente_deportivo | caja | gimnasio | empresa | institucion_educativa | otro`, plan y banderas de funciones, logo, zona horaria, dominios de correo permitidos, texto de autorización de datos versionado, retention_days), `sites` (sedes o puntos, con `loan_point_code`).
- **Casos de uso:** crear entidad (solo `platform_admin`), editar ajustes, CRUD de sedes, `FeatureGate` que consulta las banderas del plan (sin cobro real).
- **Rutas:** `GET|PATCH /organization`, `GET|POST|PATCH /sites`, `GET|POST|PATCH /platform/organizations`.
- **Pantallas:** ajustes de la entidad (logo, textos, dominios), sedes y puntos de préstamo (con su QR imprimible).

### 3. `people` (participantes)

- **Tablas:** `people` (organization_id, tipo y número de documento, código institucional, nombre completo, correo, teléfono, tipo de persona, `is_minor`, acudiente, `qr_token` opaco), `consents` (persona, versión del texto, fecha, canal, hash de IP).
- **Índices y unicidad:** único `(organization_id, document_type, document_number)`; índice `(organization_id, institutional_code)`; único `qr_token`.
- **Casos de uso:** alta y edición, búsqueda exacta por documento o código, importación CSV/XLSX con **vista previa y reporte de errores antes de confirmar** (upsert por documento), registro de autorización de datos, rotación del `qr_token`, enmascarado de datos.
- **Rutas:** `GET|POST /people`, `PATCH /people/:id`, `POST /people/import`, `POST /people/:id/rotate-qr`.
- **Pantallas:** directorio, importación guiada, detalle de persona.

### 4. `events` (eventos y actividades)

- **Tablas:** `events` (nombre, descripción, tipo `mass | course | recurring`, sede, inicio y fin, ventana de check-in, aforo opcional, estado `draft | scheduled | open | closed | cancelled`, `public_code` único de 8 caracteres, modo de identificación permitido, `confirm_identity`, `allow_walk_in`, regla de certificado, `auto_issue_certificates`), `event_sessions`.
- **Patrones:** `EventFactory` + `EventBuilder` para crear, `State` para el ciclo de vida, `duplicate()` (Prototype).
- **Casos de uso:** crear, editar (solo en `draft`/`scheduled`), publicar, abrir y cerrar (manual y por trabajo programado cada minuto), cancelar, duplicar, generar QR (PNG/SVG) y **afiche imprimible en PDF**.
- **Eventos de dominio:** `event.published`, `event.opened`, `event.closed`, `event.cancelled`.
- **Rutas:** `GET|POST /events`, `GET|PATCH /events/:id`, `POST /events/:id/{publish,open,close,cancel,duplicate}`, `GET /events/:id/qr`, `GET /events/:id/poster.pdf`.
- **Pantallas:** lista con filtros, asistente de creación por pasos (según el tipo), detalle con QR, estado y contador en vivo.

### 5. `attendance` (asistencia): la ruta caliente

- **Tablas:** `attendance_records` (event_id, session_id, person_id, organization_id, checked_in_at, método `event_qr | person_qr | manual`, registrado_por, estado `valid | voided`, motivo de anulación, `client_duration_ms` opcional).
- **Unicidad:** único `(event_id, session_id, person_id)` donde `status='valid'`; índice `(organization_id, event_id, checked_in_at)`.
- **Público (sin cuenta):**
  - `GET /public/checkin/:code`: datos mínimos del evento y de la entidad (con caché corta).
  - `POST /public/checkin/:code/lookup` _(solo si `confirm_identity`)_: devuelve «Juan P.».
  - `POST /public/checkin/:code`: registra y responde `registered` o `already_registered` con la hora original. Si la persona no existe y el evento permite `allow_walk_in`, responde `needs_registration` y un segundo envío crea la persona (con autorización de datos) y registra.
- **Funcionario (JWT):** `POST /events/:id/attendance/scan` (QR del carné), `POST /events/:id/attendance` (manual), `POST /attendance/:id/void` (con motivo, auditado), `GET /events/:id/attendance`, `GET /events/:id/attendance/stream` (flujo en vivo con contador).
- **Rendimiento (requisitos duros):** un solo `INSERT … ON CONFLICT DO NOTHING` por check-in, búsqueda por índice, **ningún efecto secundario síncrono** (se publica `attendance.registered` tras el commit), contador en memoria reconciliado periódicamente, límites de tasa del punto A7.2. Pool de conexiones dimensionado y documentado.
- **Antifraude básico:** registro del método, hash de IP y user agent; ventana de tiempo; aforo. Opcional (fase 7): «código del momento» rotativo que el funcionario muestra en una pantalla del lugar.
- **Patrón:** `IdentificationStrategy`.
- **Pantallas:** página pública de check-in, modo quiosco, vista en vivo del evento, lista de asistentes con anulación.

### 6. `certificates` (certificados)

- **Tablas:** `certificate_templates` (título, texto con variables `{{full_name}} {{event_name}} {{date}} {{hours}}`, logo, firmas con nombre y cargo, orientación, versión), `certificates` (event_id, person_id, `code` público de 12 caracteres con dígito de control, estado `issued | revoked`, instantánea de la plantilla usada, ruta del PDF, hash SHA-256 del PDF, `delivered_at`, `revoked_reason`).
- **Unicidad:** único `(event_id, person_id)` activo; `code` único.
- **Casos de uso:** crear y versionar plantillas, vista previa, **evaluar elegibilidad** (lista de elegibles y no elegibles con la razón), emitir en lote de forma idempotente, generar el PDF como trabajo en segundo plano con concurrencia limitada, descargar uno o todos (zip), reenviar por correo, revocar con motivo (auditado), emisión automática al cerrar el evento si está activada.
- **Verificación pública:** `GET /public/certificates/verify/:code` devuelve validez, nombre del titular, evento, fecha y entidad emisora (**nunca** el documento). Página pública `/v/:code`. El QR del PDF apunta a esa página.
- **Rutas:** `GET|POST|PATCH /certificate-templates`, `POST /certificate-templates/:id/preview`, `POST /events/:id/certificates/{evaluate,issue}`, `GET /events/:id/certificates`, `GET /certificates/:id/pdf`, `POST /certificates/:id/{revoke,resend}`.
- **Eventos:** consume `event.closed`; publica `certificate.issued`, `certificate.revoked`.
- **Patrón:** `EligibilityStrategy`. PDF generado con puerto `PdfRenderer` (adaptador PDFKit).
- **Pantallas:** editor de plantilla con vista previa, panel de emisión por evento, listado con estados, página pública de verificación.

### 7. `inventory` (inventario)

- **Tablas:** `categories`, `item_models` (nombre, categoría, descripción, foto), `units` (organization_id, site_id, model_id, `code`, `qr_token`, condición, estado `available | loaned | maintenance | lost | retired`, `version`), `movements` (historial de cambios de estado).
- **Unicidad:** único `(organization_id, code)`; índice `(organization_id, site_id, status)`.
- **Casos de uso:** CRUD de modelos y categorías, **alta masiva de unidades** (cantidad + prefijo), cambio de estado con motivo (auditado), historial, resumen de disponibilidad por modelo y sede, **hoja de etiquetas QR en PDF**, importación CSV.
- **Concurrencia:** la reserva de una unidad es atómica (`UPDATE … WHERE status='available' RETURNING`), para que nunca se preste dos veces.
- **Fachada pública:** `lendUnit(unitId, loanId, tx)`, `returnUnit(unitId, condition, tx)`, `availabilityByModel(siteId)`.
- **Rutas:** `/item-models`, `/item-models/:id/units` (alta masiva), `PATCH /units/:id`, `GET /units/labels.pdf`, `GET /inventory/summary`.
- **Pantallas:** catálogo, detalle de modelo con sus unidades, estado del inventario, etiquetas.

### 8. `loans` (préstamos)

- **Tablas:** `loans` (organization_id, site_id, person_id, estado, `due_at`, `signature_file`, `signature_hash`, versión del texto de autorización aceptado, hash de IP, user agent, `idempotency_key`), `loan_lines` (unit_id, `returned_at`, condición al devolver).
- **Unicidad:** índice parcial único sobre `loan_lines(unit_id)` donde `returned_at IS NULL` (una unidad no puede estar en dos préstamos abiertos).
- **Ciclo de vida (State):** `pending_delivery` → `active` → `returned` | `partially_returned` | `lost`; además `cancelled` y `expired` (si nadie recoge en X minutos). `overdue` se marca por trabajo programado cuando `due_at` vence.
- **Flujo A, autoservicio:** la persona escanea el QR del punto (`/p/:code`), acepta la autorización (bloquea el formulario), se identifica, elige modelos disponibles y firma. El préstamo queda en `pending_delivery`; el funcionario lo ve en «Solicitudes pendientes», elige o escanea las unidades físicas y confirma la entrega (`active`).
- **Flujo B, asistido:** el funcionario crea el préstamo directamente.
- **Devolución:** el funcionario escanea la unidad, registra la condición (buena, dañada, incompleta); una unidad dañada pasa a `maintenance`.
- **Políticas (Strategy):** plazo por categoría (horas, fin del día, fin del evento) y elegibilidad (bloquear a quien tenga préstamos vencidos, configurable).
- **Seguimiento:** trabajo programado que marca vencidos y publica `loan.overdue` según el calendario de recordatorios (antes del vencimiento, al vencer, +1 día, +3 días). `notifications` envía los correos.
- **Eventos:** `loan.requested`, `loan.delivered`, `loan.returned`, `loan.overdue`, `loan.lost`.
- **Público:** `GET /public/loan-points/:code`, `POST /public/loan-points/:code/requests` (con `Idempotency-Key`).
- **Funcionario:** `GET /loans`, `GET /loans/pending`, `POST /loans` (asistido), `POST /loans/:id/{deliver,return,mark-lost,cancel}`.
- **Nota de firma:** la firma capturada con consentimiento, hora, IP y versión del texto es una firma electrónica simple. Debe revisarla un asesor jurídico (registrar en `docs/pendientes.md`).
- **Pantallas:** asistente público (banner, autorización que bloquea, progreso, selección, firma), solicitudes pendientes, préstamos activos y vencidos, devolución con escaneo.

### 9. `notifications` (notificaciones)

- **Tablas:** `notifications` (organization_id, canal, plantilla, destinatario, datos, estado `queued | sent | failed`, intentos, error, entidad relacionada, clave de deduplicación), `templates` (plantillas por defecto en código, sobreescribibles por entidad).
- **Canales:** `NotificationChannel` (Strategy + Adapter): `EmailChannel` (SMTP con `nodemailer`) y `LogChannel` (desarrollo). Reintentos con espera creciente por `pg-boss`; deduplicación.
- **Manejadores:** `certificate.issued` → correo con enlace de descarga/verificación; `loan.delivered` → comprobante; `loan.overdue` → recordatorio; `loan.returned` → comprobante.
- **Plantillas:** HTML y texto, adaptadas a celular, en español, con el logo de la entidad.
- **Rutas:** `GET /notifications` (registro), `POST /notifications/:id/retry`.
- **Pantalla:** registro de envíos con estado y reintento.

### 10. `reports` (estadísticas y reportes descargables)

Ver B2. Resumen: tablero de **estadísticas**, catálogo de **reportes descargables** (CSV, Excel, PDF) y los **indicadores del piloto**.

## B2. Estadísticas y generación de reportes (apartado propio del panel)

El panel tiene dos secciones en el menú: **Estadísticas** y **Reportes**.

### B2.1 Estadísticas

- **Filtros globales:** rango de fechas (con atajos: hoy, 7 días, 30 días, mes actual), sede, evento. Compara con el período anterior. Muestra «Actualizado hace X».
- **Agrupación por día en la zona `America/Bogota`** (`date_trunc` con `AT TIME ZONE`).
- **Pestaña Resumen:** tarjetas de indicadores: asistentes únicos, check-ins, eventos realizados, certificados emitidos, préstamos activos, préstamos vencidos, porcentaje de devoluciones a tiempo, disponibilidad del inventario. Cada tarjeta muestra la variación contra el período anterior.
- **Pestaña Asistencia:** serie diaria de check-ins; distribución por hora del día; **pico por minuto de un evento**; asistencia por sede; por tipo de persona; nuevos frente a recurrentes; eventos con más y menos asistencia; personas con N o más eventos.
- **Pestaña Certificados:** emitidos por evento, pendientes, revocados, entregados por correo frente a fallidos, número de verificaciones públicas.
- **Pestaña Inventario y préstamos:** disponibilidad por modelo y sede, modelos más prestados, duración media del préstamo, antigüedad de la mora (0–1 día, 2–3, 4–7, más de 7), tasa de devolución con daños.
- **Pestaña Indicadores del piloto:** (1) tiempo mediano por registro (usa `client_duration_ms`), (2) porcentaje de implementos devueltos a tiempo, (3) certificados emitidos sin reproceso (emitidos menos revocados y reemitidos). Con su fórmula visible.
- Cada gráfico: título, descripción de una línea, botón «Ver como tabla», botón «Descargar» (CSV de ese gráfico) y estados vacío, cargando y error.
- Rendimiento: las consultas usan **solo las vistas `v_pub_*`** de cada módulo, con índices; resultados en caché de 60 s por entidad y parámetros.

### B2.2 Reportes descargables

Catálogo (cada reporte con descripción, parámetros y formatos):

| Reporte                               | Contenido                                                 | Formatos                            | Datos personales              |
| ------------------------------------- | --------------------------------------------------------- | ----------------------------------- | ----------------------------- |
| Asistencia por evento                 | Asistentes, hora, método, sede                            | CSV, XLSX, PDF                      | Sí (enmascarados por defecto) |
| Consolidado de asistencia por período | Totales por evento, día y sede                            | CSV, XLSX                           | No                            |
| Certificados emitidos                 | Código, titular, evento, estado, fecha                    | CSV, XLSX                           | Sí                            |
| Estado del inventario                 | Unidades por modelo, sede y estado                        | CSV, XLSX                           | No                            |
| Préstamos y devoluciones              | Por período, con duración y condición                     | CSV, XLSX                           | Sí                            |
| Préstamos vencidos                    | Para seguimiento: persona, contacto, unidad, días de mora | CSV, XLSX                           | Sí                            |
| **Resumen ejecutivo mensual**         | Indicadores, gráficos y tablas para rendir cuentas        | **PDF** (con el logo de la entidad) | No                            |

- **Cómo se generan:** `POST /reports/runs { type, format, params }` crea una ejecución (`queued → running → ready | failed`) en `reports.runs`. Un trabajo de `pg-boss` genera el archivo y lo guarda con `FileStorage`. La pantalla «Mis reportes» lista las ejecuciones con estado y descarga. Los reportes pequeños pueden responder directo en streaming.
- **Descarga:** `GET /reports/runs/:id/download` verifica rol y entidad, tiene **caducidad** (7 días) y se descarga con `fetch` + `Authorization` (sin JWT en la URL). Cada descarga con datos personales queda en el `AuditLog`.
- **Nombre de archivo:** `tap_<slug-entidad>_<tipo>_<AAAA-MM-DD>.<ext>`.
- **CSV:** UTF-8 con BOM y separador configurable (por defecto `;`, porque Excel con configuración regional es-CO lo espera).
- **XLSX (`exceljs`):** encabezado en negrita, fila fija, autofiltro, anchos de columna, formatos de fecha/hora en `America/Bogota`, hoja **Resumen**, hoja **Detalle** y hoja **Parámetros** (quién lo generó, cuándo, filtros).
- **PDF (`pdfkit`):** logo, título, período, tablas y gráficos de barras y líneas dibujados con primitivas vectoriales (sin navegador headless), pie con fecha de generación y página.
- **Límites:** máximo 200.000 filas por reporte; más allá, se pide acotar el rango.
- **Permisos:** `viewer` ve estadísticas agregadas y descarga reportes sin datos personales. `operator` descarga reportes con datos personales **enmascarados** (`•••1234`). `org_admin` puede pedir documentos completos indicando el motivo, y eso se audita.
- **Pruebas:** los totales del reporte coinciden con el conteo en bruto; el archivo generado se vuelve a leer en la prueba (XLSX con `exceljs`, CSV parseado); enmascarado correcto; permisos; aislamiento entre entidades; trabajo fallido deja la ejecución en `failed` con mensaje.
- Opcional (Fase 7): programar el resumen mensual por correo.

## B3. Datos de demostración (semillas deterministas, todo ficticio)

- 2 entidades: «Bienestar Demo» (`institucion_educativa`) e «Instituto de Deporte Demo» (`ente_deportivo`), cada una con 2 sedes.
- Usuarios de cada rol por entidad más un `platform_admin`. **Las contraseñas de demostración salen de `.env` (`SEED_*`); no las imprimas ni las escribas en documentos.**
- 300 personas por entidad (algunas menores), 3 eventos: uno masivo con miles de check-ins simulados, un curso de 4 sesiones, y uno pasado ya cerrado con asistencia para emitir certificados.
- Inventario: 4 modelos y 40 unidades por entidad; préstamos activos, devueltos y uno vencido.
- Plantilla de certificado por defecto y un historial de 60 días para que las estadísticas tengan datos.
- `docs/demo.md`: guion de demostración de 5 minutos.

## B4. Fases, criterios de aceptación y compuertas

Al terminar **cada fase**: ejecuta `pnpm check`; escribe un resumen corto (qué se hizo, qué falló, qué queda); muestra `git diff --stat` y el resultado de `check:secrets`; propón los commits; **detente y espera mi respuesta** (A2).

### Fase 0: Cimientos y configuración auditable → **COMPUERTA G0**

1. Primero: `.gitignore`, `.dockerignore`, `.editorconfig`, `.env.example` (A7.5). Verifica con `git check-ignore -v` que `.env`, `.pem`, `secrets/`, `storage/` y volúmenes quedan ignorados.
2. Monorepo pnpm, TypeScript estricto, ESLint (con reglas de límites de módulos), Prettier, husky, commitlint, lint-staged.
3. `docker-compose.yml` (Postgres 17 en `127.0.0.1`, Mailpit; perfil `full`), Dockerfiles, `docker/init/` con el rol sin privilegios.
4. Scripts: `setup:env`, `env:check`, `check:secrets`, `check:bundle`, `check`.
5. API: configuración con Zod, logger, modelo de errores, `GET /health` y `/ready`, Drizzle conectado, esquemas de módulos creados, primera migración, `JobQueue` y `EventBus` en `shared`.
6. Web: Vite + Tailwind v4, **tokens de los dos temas**, selector de tema, página de demostración de componentes base (Button, Card, Input, Badge, Table, StatCard, un gráfico), prueba de contraste de tokens.
7. CI (`.github/workflows/ci.yml`).
8. **`docs/auditoria-configuracion-inicial.md`** con: lista de cada archivo de configuración y su propósito; salida de `git check-ignore -v`; `git status --short` (sin añadir nada); **nombres** de las variables de entorno (sin valores); puertos y enlaces de red; revisión del compose (sin credenciales por defecto, puerto de base de datos local, volúmenes); configuración de cookies, CORS, helmet y JWT (algoritmo y vigencias, sin claves); dependencias instaladas con versión y justificación; resultado de `pnpm audit` y de `check:secrets`; hooks activos.

- **Aceptación:** `pnpm setup:env && docker compose up -d db mailpit && pnpm dev` levanta API y web; `pnpm check` en verde; el documento de auditoría existe.
- **G0:** te detienes, me presentas la auditoría y esperas mi revisión. Solo después de mi visto bueno **pides permiso** para el primer commit (con la lista de archivos exacta) y, aparte, para cualquier push.

### Fase 1: `access` + `organizations`

- JWT completo (A7.1), refresco rotatorio con detección de reutilización, roles, usuarios, Google opcional, alta de entidades y sedes, pantalla de inicio de sesión en ambos temas, layout del panel con barra lateral.
- **Aceptación:** todas las pruebas de seguridad de A7.1; aislamiento entre entidades; `FeatureGate`; E2E de inicio de sesión y cierre de sesión.

### Fase 2: `people` + `events`

- Directorio e importación con vista previa; eventos con Factory, Builder y State; QR y afiche en PDF; apertura y cierre programados.
- **Aceptación:** importación con errores reportados fila por fila; transiciones de estado inválidas rechazadas; pruebas de unidad de Factory/Builder/State.

### Fase 3: `attendance`

- Check-in público, estrategias de identificación, modo quiosco, flujo en vivo, anulación, límites de tasa. Vistas `v_pub_attendance_*` y estadísticas básicas de asistencia.
- **Aceptación:** prueba de carga k6 (A8) con los números reales reportados; idempotencia (doble envío no duplica); ninguna llamada de correo o PDF en la ruta del check-in; E2E del check-in público.

### Fase 4: `notifications` + `certificates`

- Plantillas, elegibilidad, emisión en lote, PDF con QR, verificación pública, envío por correo (Mailpit), revocación.
- **Aceptación:** emitir dos veces no duplica; PDF abre y el QR lleva a la verificación; revocar se refleja en la verificación pública; E2E de emisión y verificación.

### Fase 5: `inventory` + `loans`

- Catálogo, unidades, etiquetas QR, flujos A y B de préstamo, devolución, mora y recordatorios.
- **Aceptación:** una unidad nunca queda en dos préstamos (prueba de concurrencia); el formulario público no avanza sin la autorización; `Idempotency-Key`; E2E de préstamo y devolución.

### Fase 6: `reports` (Estadísticas y Reportes)

- Todo lo de B2: tablero con las cuatro pestañas, catálogo de reportes, ejecuciones asíncronas, CSV/XLSX/PDF, permisos y enmascarado, «Mis reportes».
- **Aceptación:** las pruebas de B2.2; los archivos descargados se abren y sus totales coinciden con los de pantalla; E2E que genera y descarga un reporte.

### Fase 7: Pulido y revisión final

- Accesibilidad (axe) y contraste en ambos temas; rendimiento; semillas y `docs/demo.md`; README de arranque; OpenAPI; **`docs/revision-seguridad-final.md`** (repaso de A7 punto por punto, escaneo de secretos del historial y del bundle, `pnpm audit`); opcionales (código del momento rotativo, resumen mensual por correo).
- **Aceptación:** `pnpm check` en verde, E2E en verde, k6 reportado, documentación completa.

## B5. Entregables y definición de terminado

- `docker compose up -d db mailpit` + `pnpm setup:env && pnpm db:migrate && pnpm db:seed && pnpm dev` deja todo funcionando; `docker compose --profile full up` también.
- README con arranque rápido (sin credenciales dentro; apunta a `.env`).
- `docs/`: `plan.md`, `adr/`, `dependencias.md`, `auditoria-configuracion-inicial.md`, `revision-seguridad-final.md`, `demo.md`, `pendientes.md`, y un `docs/modulos/<modulo>.md` por módulo (responsabilidad, fachada, eventos, reglas).
- Informe de pruebas y de la carga con los números reales.
- **Ningún commit ni push que yo no haya autorizado.** Al final, déjame el listado de lo pendiente y de las decisiones que tomaste por tu cuenta.
