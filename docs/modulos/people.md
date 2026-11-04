# Módulo `people` (Directorio de Personas, Carné QR y Ley 1581)

## 1. Responsabilidad

Gestiona el directorio de participantes (estudiantes, docentes, colaboradores, afiliados o visitantes) de cada entidad sin exigirles crear una cuenta de usuario, así como el registro de autorizaciones de tratamiento de datos personales conforme a la Ley 1581 de 2012.

## 2. Modelo de datos (`people.*`)

Esquema propio de PostgreSQL: `people`.

- `people.people`:
  - `id` (UUID v7, PK).
  - `organization_id` (UUID, indexado — aislamiento multi-tenant obligatorio).
  - `document_type` (`CC | TI | CE | PAS | OTRO`) y `document_number` (únicos por `(organization_id, document_type, document_number)`).
  - `external_code` (código estudiantil o de afiliado, indexado por `(organization_id, external_code)`).
  - `full_name`, `email`, `phone`, `unit_or_program`, `role_type` (`student | teacher | staff | affiliate | guest`).
  - `is_minor` (`boolean`), `guardian_name` (`text`), `guardian_contact` (`text`).
  - `qr_token` (token opaco único de 16 caracteres del alfabeto sin ambigüedades para el carné QR individual).
  - `status` (`active | blocked`).
  - `created_at`, `updated_at` (`timestamptz`).
- `people.consents`:
  - `id` (UUID v7, PK).
  - `organization_id` (UUID, indexado).
  - `person_id` (UUID, FK a `people.people`).
  - `consent_version` (`varchar(32)` — versión del texto legal aceptado).
  - `accepted_at` (`timestamptz`), `channel` (`public_checkin | public_loan | staff_panel`), `ip_hash` (hash SHA-256 de IP).

## 3. Reglas de negocio y Ley 1581

1. **Enmascaramiento y privacidad (`AGENTS.md` A7.2 y A7.4)**:
   - `maskDocumentNumber(documentNumber)`: oculta todos los dígitos salvo los últimos 4 (`•••1234`) para respuestas públicas y registros de auditoría.
   - `abbreviatePersonName(fullName)`: devuelve el primer nombre y la inicial del primer apellido (`Juan P.`) para confirmaciones en flujos públicos donde no deben exponerse datos completos de terceros.
2. **Protección de menores de edad**:
   - `validateMinorGuardian(...)`: si `isMinor === true`, exige `guardianName` y `guardianContact` (mínimo 3 caracteres cada uno) o rechaza la operación con `ValidationError` (422).
3. **Importación masiva por CSV con vista previa e idempotencia (upsert)**:
   - Soporta delimitadores `,` y `;` y cabeceras en español o inglés (`tipo_documento`, `numero_documento`, `codigo_estudiantil`, `nombre_completo`, `correo`, `telefono`, `dependencia_programa`, `estamento`, `es_menor`, `nombre_acudiente`, `contacto_acudiente`).
   - Con `dryRun: true`, valida todas las filas y devuelve contadores (`validRows`, `toCreateCount`, `toUpdateCount`, `issues`) y hasta 10 filas de vista previa sin tocar la base de datos.
   - Con `dryRun: false`, ejecuta upsert por `(organization_id, document_type, document_number)`: si el documento ya existe en la entidad, actualiza sus datos conservando su `id` y su `qr_token` de carné; si no existe, lo crea con un nuevo `qr_token`.
4. **Rotación del QR del carné**:
   - Si un participante pierde su carné, `rotateQrToken` genera un nuevo `qr_token` criptográfico e invalida el anterior, dejando traza en `AuditLog`.

## 4. Fachada pública (`apps/api/src/modules/people/index.ts`)

Expone:

- `PeopleService` (`listPeople`, `getPersonById`, `createPerson`, `updatePerson`, `rotateQrToken`, `importPeopleCsv`).
- `PeopleRepository`, `DrizzlePeopleRepository`, `InMemoryPeopleRepository`.
- Funciones puras de privacidad: `maskDocumentNumber`, `abbreviatePersonName`.

## 5. Rutas HTTP (`/api/v1/people`)

- `GET /api/v1/people?search=&status=` — Lista y busca personas de la entidad del funcionario autenticado.
- `POST /api/v1/people` — Registra una persona (`org_admin`, `operator`).
- `GET /api/v1/people/:id` — Obtiene el detalle de una persona de la entidad.
- `PATCH /api/v1/people/:id` — Actualiza datos, estado o acudiente (`org_admin`, `operator`).
- `POST /api/v1/people/:id/rotate-qr` — Regenera el token QR del carné (`org_admin`, `operator`).
- `POST /api/v1/people/import` — Valida (`dryRun: true`) o ejecuta (`dryRun: false`) la importación CSV fila por fila.
