# Módulo `organizations` — Entidades (Tenants), Planes, FeatureGate y Sedes

## 1. Responsabilidad

Gestiona las entidades clientes (`Organization` / tenant), sus planes comerciales (`pilot`, `standard`, `institutional`), el control de módulos habilitados por entidad (`FeatureGate`), las políticas de dominios de correo autorizados, el texto versionado de autorización de datos personales (Ley 1581 de 2012) y las sedes o puntos físicos (`Site`) con código público único para préstamos (`/p/:loanPointCode`).

## 2. Modelo de datos (`organizations.*`)

| Tabla                         | Campos principales                                                                                                                                                                                                                                | Propósito                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `organizations.organizations` | `id` (UUID v7), `name`, `slug` (único), `type`, `plan`, `features` (JSONB), `logo_url`, `timezone` (`America/Bogota`), `allowed_email_domains` (JSONB), `data_consent_version`, `data_consent_text`, `retention_days`, `created_at`, `updated_at` | Configuración institucional, legal y comercial de cada entidad cliente.             |
| `organizations.sites`         | `id` (UUID v7), `organization_id` (indexado), `name`, `code`, `address`, `loan_point_code` (único, 8 caracteres sin ambigüedades), `is_active`, `created_at`, `updated_at`                                                                        | Sedes o puntos de atención donde se entregan implementos o se realizan actividades. |

## 3. Invariantes de dominio (`AGENTS.md` A5.7, A7.4, B3.2)

1. **Aislamiento estricto por `organization_id`:**
   - Ningún funcionario de la entidad A puede consultar ni modificar la configuración o las sedes de la entidad B.
   - El alta de nuevas entidades y el cambio de plan o banderas (`features`) está restringido exclusivamente al rol `platform_admin` verificado en el caso de uso.
2. **Códigos públicos de alta entropía sin caracteres ambiguos:**
   - Cada sede recibe al crearse un `loanPointCode` de 8 caracteres generado con fuente criptográfica sobre el alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, libre de colisiones.
3. **Control de capacidades por plan (`FeatureGate`):**
   - `FeatureGate.requireFeature(organizationId, feature)` verifica que el módulo solicitado (`attendance`, `certificates`, `inventory`, `loans`, `reports`, `kioskMode`, `googleSso`) esté activo en la entidad antes de ejecutar casos de uso de otros módulos.
4. **Cumplimiento de datos personales (Ley 1581 de 2012):**
   - Toda entidad mantiene `dataConsentVersion`, `dataConsentText` (mínimo 20 caracteres) y `retentionDays` (entre 30 y 3650 días).

## 4. Patrones utilizados

- **Repository (`OrganizationsRepository`):** abstrae el almacenamiento en PostgreSQL (`DrizzleOrganizationsRepository`) y en memoria para pruebas rápidas (`InMemoryOrganizationsRepository`).
- **Policy / Gate (`FeatureGate`):** centraliza la verificación de módulos habilitados por plan de la entidad.

## 5. Fachada pública (`apps/api/src/modules/organizations/index.ts`)

- `getOrganizationById(id)` → `Promise<OrganizationDto | null>`
- `getOrganizationBySlug(slug)` → `Promise<OrganizationDto | null>`
- `isEmailAllowed(organizationId, email)` → `Promise<boolean>`
- `requireFeature(organizationId, feature)` → `Promise<void>`

## 6. Endpoints HTTP (`/api/v1`)

| Método y ruta                       | Permiso                   | Descripción                                                                      |
| ----------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `GET /platform/organizations`       | `platform_admin`          | Lista todas las entidades registradas en la plataforma.                          |
| `POST /platform/organizations`      | `platform_admin`          | Registra una nueva entidad cliente con su plan y `features`.                     |
| `PATCH /platform/organizations/:id` | `platform_admin`          | Actualiza plan, `features` o parámetros de cualquier entidad.                    |
| `GET /organization`                 | Autenticado (con entidad) | Obtiene la configuración de la entidad del funcionario actual.                   |
| `PATCH /organization`               | `org_admin`               | Actualiza nombre, dominios permitidos, texto Ley 1581 y retención de su entidad. |
| `GET /sites`                        | Autenticado (con entidad) | Lista las sedes de la entidad actual.                                            |
| `POST /sites`                       | `org_admin`               | Crea una nueva sede y genera su `loanPointCode` único.                           |
| `PATCH /sites/:id`                  | `org_admin`               | Actualiza nombre, dirección o estado (`isActive`) de una sede de su entidad.     |

## 7. Eventos de auditoría (`AuditLog`)

- `organization.created`
- `organization.updated`
- `site.created`
- `site.updated`
