# Módulo `access` — Autenticación, Sesiones y Roles del Personal

## 1. Responsabilidad

Gestiona las cuentas de funcionarios (`platform_admin`, `org_admin`, `operator`, `viewer`), la autenticación con contraseña (Argon2id) o con Google OIDC completada en el servidor, la emisión y verificación de tokens de acceso JWT de vida corta firmados con `EdDSA` (Ed25519), la rotación y revocación de familias de tokens de refresco opacos, y la caché de estado activo del usuario (máximo 60 s).

Los participantes y estudiantes **no tienen cuenta** y nunca pasan por este módulo.

## 2. Modelo de datos (`access.*`)

| Tabla                   | Campos principales                                                                                                                                                                                        | Propósito                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `access.users`          | `id` (UUID v7), `organization_id` (nullable para `platform_admin`), `email` (único), `full_name`, `password_hash`, `role`, `status` (`active` \| `disabled`), `token_version`, `created_at`, `updated_at` | Cuentas del personal operativo y administrativo.                                                                    |
| `access.refresh_tokens` | `id`, `user_id`, `token_hash` (SHA-256), `family_id`, `expires_at`, `family_expires_at`, `revoked_at`, `replaced_by`, `user_agent`, `ip_hash`, `created_at`                                               | Almacena únicamente el hash del token opaco rotatorio con ventana de 7 días y tope absoluto de 30 días por familia. |
| `access.oauth_accounts` | `id`, `user_id`, `provider` (`google`), `provider_account_id`, `email`, `created_at`                                                                                                                      | Vinculación de cuentas institucionales de Google con usuarios autorizados.                                          |

## 3. Invariantes y reglas de seguridad (`AGENTS.md` A7.1)

1. **Par de tokens sin datos personales en el JWT:**
   - El JWT de acceso dura 15 minutos (`JWT_ACCESS_TTL=15m`), lleva cabecera `{ alg: 'EdDSA', typ: 'JWT', kid: 'tap-ed25519-v1' }` y contiene solo `iss`, `aud`, `sub`, `org`, `role`, `iat`, `exp`, `jti`. **Nunca incluye correo ni nombre.**
   - `verifyAccessToken` aplica lista blanca estricta `algorithms: ['EdDSA']` (rechaza `none` y cualquier otro algoritmo) y valida `iss`, `aud` y `exp`.
2. **Almacenamiento en el cliente:**
   - El JWT de acceso vive **únicamente en memoria** del navegador (`memoryAccessToken` en `http-client.ts`), jamás en `localStorage` ni `sessionStorage`.
   - El token de refresco opaco viaja en la cookie `tap_refresh_token` con atributos `HttpOnly; SameSite=Strict; Path=/api/v1/auth` (y `Secure` según `COOKIE_SECURE`).
3. **Rotación y detección de reutilización de refresco:**
   - Cada llamada a `POST /api/v1/auth/refresh` invalida el token anterior (`replaced_by = newId`, `revoked_at = now`) y emite uno nuevo dentro de la misma `family_id`.
   - Si alguien presenta un token que ya tiene `replaced_by !== null` o `revoked_at !== null`, `AccessService` **revoca toda la familia (`family_id`) de inmediato** y registra el evento `auth.refresh_token_reuse_detected` en `AuditLog`.
4. **Efecto inmediato al deshabilitar una cuenta:**
   - `UserStatusCache` conserva el estado del usuario por máximo 60 s y se invalida al instante cuando se deshabilita un usuario o cambia su rol/contraseña.
5. **Contraseñas y protección contra fuerza bruta:**
   - Hash con `@node-rs/argon2` (`Argon2id`). Mínimo 12 caracteres, validación contra lista de contraseñas comunes y prohibición de incluir el usuario del correo.
   - `LoginRateLimiter` aplica espera exponencial creciente por `IP + correo` a partir del quinto intento fallido.

## 4. Patrones utilizados

- **Repository (`AccessRepository`):** desacopla `AccessService` de Drizzle (`DrizzleAccessRepository` / `InMemoryAccessRepository`).
- **Adapter (`PasswordHasher`, `JwtTokenService`, `GoogleOAuthClient`):** aísla `@node-rs/argon2`, `jose` y el proveedor OAuth detrás de puertos de dominio.

## 5. Fachada pública (`apps/api/src/modules/access/index.ts`)

- `verifyAccessToken(token)` → `Promise<TenantContext>`
- `getUserStatus(userId)` → `Promise<UserActiveState | null>`
- `requireRole(ctx, allowedRoles)` → `void`
- `authenticateRequest(req)` → `Promise<TenantContext>`

## 6. Endpoints HTTP (`/api/v1`)

| Método y ruta                | Permiso                  | Descripción                                                                              |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `POST /auth/login`           | Público (con rate limit) | Inicia sesión con correo y contraseña; devuelve JWT en cuerpo y cookie `HttpOnly`.       |
| `POST /auth/refresh`         | Cookie `HttpOnly`        | Rota el token de refresco y emite un nuevo JWT de acceso.                                |
| `POST /auth/logout`          | Cookie `HttpOnly`        | Revoca la familia de refresco activa y limpia la cookie.                                 |
| `GET /auth/google`           | Público                  | Genera URL de autorización OIDC con cookie de estado firmada.                            |
| `GET /auth/google/callback`  | Público                  | Completa OIDC en el servidor, valida dominio permitido de la entidad y emite sesión.     |
| `GET /auth/me`               | Autenticado              | Devuelve el perfil del funcionario actual.                                               |
| `POST /auth/change-password` | Autenticado              | Verifica clave actual, actualiza hash Argon2id y revoca todas las sesiones del usuario.  |
| `GET /users`                 | `org_admin`              | Lista los usuarios pertenecientes al `organizationId` del solicitante.                   |
| `POST /users`                | `org_admin`              | Crea un usuario en la entidad actual validando dominios permitidos y fortaleza de clave. |
| `PATCH /users/:id`           | `org_admin`              | Actualiza nombre, rol o estado dentro de la misma entidad.                               |
| `POST /users/:id/disable`    | `org_admin`              | Deshabilita la cuenta, invalida la caché de estado y revoca sus tokens de refresco.      |

## 7. Eventos de auditoría (`AuditLog`)

- `auth.login` (método `password` o `google`)
- `auth.refresh_token_reuse_detected`
- `user.created`
- `user.role_changed`
- `user.disabled`
- `user.password_changed`
