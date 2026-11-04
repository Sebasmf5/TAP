# Plan de construcción de Tap

## Lectura de la arquitectura

- **Monolito modular cliente-servidor** en un monorepo pnpm: `apps/api` (Fastify 5 + Zod + Drizzle sobre PostgreSQL 17), `apps/web` (React 19 + Vite + Tailwind v4) y `packages/contracts` (esquemas Zod compartidos, sin lógica).
- **10 módulos** en `apps/api/src/modules/<modulo>` con capas `domain → application → http`, e `infrastructure` implementando los puertos del dominio. Un módulo solo habla con otro por su `index.ts` (fachada) o por eventos de dominio; se hace cumplir con `eslint-plugin-boundaries`.
- **Un esquema de Postgres por módulo**, sin claves foráneas entre módulos. Cada módulo publica vistas `v_pub_*` que son el único contrato de lectura para `reports`.
- **Multi-tenant desde el día uno**: `organization_id` en toda tabla de negocio, `TenantContext` derivado del JWT, repositorios que siempre filtran por entidad y una prueba de aislamiento por módulo.
- **Núcleo `shared`**: configuración Zod que falla al arrancar, logger pino con `requestId`, `AppError` → RFC 9457, `Clock`, `IdGenerator` (UUID v7), `EventBus` (publica tras el commit), `JobQueue` (pg-boss), `UnitOfWork`/`TxContext`, `FileStorage`, `AuditLog`, paginación.
- **Ruta caliente** (check-in): un `INSERT … ON CONFLICT DO NOTHING`, sin efectos secundarios síncronos; correo y PDF siempre por cola.
- **Seguridad**: JWT EdDSA de 15 min en memoria + refresco opaco rotatorio en cookie `HttpOnly; SameSite=Strict`, Argon2id, helmet, CORS en lista blanca, el frontend nunca recibe secretos (prueba de bundle), gitleaks en pre-commit y CI.
- **Diseño**: un sistema de tokens semánticos con dos temas (claro de referencia «ledger» índigo, oscuro de referencia «instrumento de medianoche» lima) y una prueba de contraste WCAG 2.2 AA que rompe el build.

## Fases

| Fase | Alcance                                                                                                                                                                                                                               | Aceptación clave                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 0    | Cimientos: archivos de seguridad primero, monorepo, calidad, Docker, scripts, API base (`/health`, `/ready`, migración inicial con los 10 esquemas, `JobQueue`, `EventBus`), web base con tokens y demo de componentes, CI, auditoría | `pnpm setup:env && docker compose up -d db mailpit && pnpm dev` levanta todo; `pnpm check` verde → **G0** |
| 1    | `access` + `organizations`                                                                                                                                                                                                            | Pruebas de seguridad A7.1, aislamiento, `FeatureGate`, E2E de sesión                                      |
| 2    | `people` + `events`                                                                                                                                                                                                                   | Importación con errores por fila, State/Factory/Builder probados                                          |
| 3    | `attendance`                                                                                                                                                                                                                          | k6 con números reales, idempotencia, E2E check-in público                                                 |
| 4    | `notifications` + `certificates`                                                                                                                                                                                                      | Emisión idempotente, PDF con QR verificable, revocación visible                                           |
| 5    | `inventory` + `loans`                                                                                                                                                                                                                 | Concurrencia sin doble préstamo, autorización que bloquea, `Idempotency-Key`                              |
| 6    | `reports`                                                                                                                                                                                                                             | Archivos que se releen y cuadran con la pantalla, permisos y enmascarado                                  |
| 7    | Pulido                                                                                                                                                                                                                                | axe, semillas, demo, OpenAPI, revisión de seguridad final                                                 |

## Forma de trabajo

- Cada fase cierra con `pnpm check`, resumen, `git diff --stat`, resultado de `check:secrets` y propuesta de commits; me detengo y espero respuesta.
- **Git**: sin commits, push ni ramas sin permiso explícito. Rama propuesta para la Fase 0: `feat/fase-0-cimientos` (se crea con `git switch -c`, que conserva los cambios del árbol de trabajo, solo cuando se autorice).
- Decisiones menores en `docs/adr/`, dependencias justificadas en `docs/dependencias.md`, pendientes en `docs/pendientes.md`.
