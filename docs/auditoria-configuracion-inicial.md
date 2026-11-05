# Auditoría de Configuración Inicial — Compuerta G0 (Fase 0)

Fecha de auditoría: `2026-11-04`

---

## 1. Archivos de configuración y su propósito

| Archivo                                                                 | Propósito                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitignore`                                                            | Ignora `.env`, `.env.*` (salvo `.env.example`), claves (`*.pem`, `*.key`, `*.p12`), `secrets/`, `storage/`, `uploads/`, datos de Docker, volcados SQL, artefactos de compilación y reportes de pruebas. |
| `.dockerignore`                                                         | Excluye `.git`, `.env*`, claves privadas, `node_modules`, `dist`, `storage`, `docs` y archivos locales del contexto de compilación de imágenes Docker.                                                  |
| `.editorconfig`                                                         | Unifica codificación UTF-8, fin de línea LF, sangría de 2 espacios y salto de línea final.                                                                                                              |
| `.gitattributes`                                                        | Fuerza normalización de finales de línea LF en archivos de código y scripts de shell, y marca binarios (`*.png`, `*.pdf`, `*.woff2`).                                                                   |
| `.node-version`                                                         | Fija la versión activa de Node.js LTS (`24`).                                                                                                                                                           |
| `.env.example`                                                          | Plantilla versionada con los **nombres** de las 30 variables de entorno y valores de ejemplo sin ningún secreto real (`AGENTS.md` A7.5).                                                                |
| `.gitleaks.toml`                                                        | Configuración de `gitleaks` para escanear el árbol de trabajo y el área de preparación (`--staged`) con redacción obligatoria (`--redact`).                                                             |
| `.prettierrc.json` / `.prettierignore`                                  | Reglas de formato de código y rutas excluidas.                                                                                                                                                          |
| `.lintstagedrc.json`                                                    | Ejecución de ESLint y Prettier sobre archivos modificados antes de cada commit.                                                                                                                         |
| `commitlint.config.js`                                                  | Reglas de Conventional Commits en español con lista de alcances de los 10 módulos.                                                                                                                      |
| `.husky/pre-commit`                                                     | Hook que ejecuta `pnpm exec lint-staged` y `pnpm check:secrets`.                                                                                                                                        |
| `.husky/commit-msg`                                                     | Hook que valida el mensaje de commit con `commitlint`.                                                                                                                                                  |
| `package.json`                                                          | Manifiesto raíz del monorepo con scripts unificados (`setup:env`, `env:check`, `dev`, `build`, `lint`, `typecheck`, `test`, `check:secrets`, `check:bundle`, `check`).                                  |
| `pnpm-workspace.yaml`                                                   | Definición de paquetes del workspace (`apps/*`, `packages/*`), aprobación explícita de scripts de compilación (`allowBuilds`) y `overrides` de seguridad.                                               |
| `tsconfig.base.json` / `tsconfig.scripts.json`                          | Configuración TypeScript `strict` compartida (`noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`).                                                                                |
| `eslint.config.js`                                                      | Configuración ESLint 10 + `typescript-eslint` + `eslint-plugin-boundaries` que hace cumplir las capas internas (`http → application → domain`) y la comunicación entre módulos solo por `index.ts`.     |
| `docker-compose.yml`                                                    | Definición de `db` (PostgreSQL 17), `mailpit`, y perfil `full` (`api`, `web`).                                                                                                                          |
| `docker/init/01-init-app-role.sh`                                       | Script de inicialización que crea el rol sin privilegios (`tap_app`) y los esquemas PostgreSQL de cada módulo.                                                                                          |
| `docker/api.Dockerfile` / `docker/web.Dockerfile` / `docker/nginx.conf` | Imágenes multi-etapa con ejecución bajo usuario no root y proxy inverso `/api` bajo el mismo sitio.                                                                                                     |
| `apps/api/drizzle.config.ts`                                            | Configuración de `drizzle-kit` apuntando a los esquemas de `shared` y de los 10 módulos.                                                                                                                |
| `apps/web/vite.config.ts`                                               | Configuración de Vite 8 + React 19 + Tailwind CSS v4 con proxy `/api` hacia `http://127.0.0.1:3000` y prefijo público `VITE_`.                                                                          |
| `.github/workflows/ci.yml`                                              | Flujo de integración continua en GitHub Actions con servicio PostgreSQL 17, `gitleaks`, generación de entorno efímero y ejecución de `pnpm check`.                                                      |

---

## 2. Verificación de `.gitignore` (`git check-ignore -v`)

Salida real ejecutada antes de instalar dependencias y verificada nuevamente al cierre de la Fase 0:

```text
.gitignore:2:.env	.env
.gitignore:3:.env.*	.env.local
.gitignore:3:.env.*	.env.production
.gitignore:4:!.env.example	.env.example
.gitignore:5:*.pem	jwt.pem
.gitignore:6:*.key	private.key
.gitignore:7:*.p12	cert.p12
.gitignore:10:secrets/	secrets/x.txt
.gitignore:13:storage/	storage/file.pdf
.gitignore:14:uploads/	uploads/logo.png
.gitignore:17:docker/data/	docker/data/pg/PG_VERSION
.gitignore:19:pgdata/	pgdata/base
.gitignore:20:docker-compose.override.yml	docker-compose.override.yml
.gitignore:28:node_modules/	node_modules/x
.gitignore:29:dist/	dist/x
.gitignore:29:dist/	apps/web/dist/index.js
.gitignore:37:coverage/	coverage/x
.gitignore:38:playwright-report/	playwright-report/x
.gitignore:39:test-results/	test-results/x
.gitignore:44:*.log	api.log
.gitignore:23:*.sql.gz	backup.sql.gz
.gitignore:24:*.dump	db.dump
.gitignore:49:.DS_Store	.DS_Store
.gitignore:51:.vscode/*	.vscode/launch.json
.gitignore:52:!.vscode/extensions.json	.vscode/extensions.json
.gitignore:54:.idea/	.idea/x
```

Nota: `.env.example` y `.vscode/extensions.json` coinciden con las reglas de excepción (`!`), lo que confirma que sí son versionables mientras que `.env` y el resto de `.vscode/*` quedan ignorados.

---

## 3. Salida de `git status --short` (sin añadir nada al índice)

```text
?? .dockerignore
?? .editorconfig
?? .env.example
?? .gitattributes
?? .github/
?? .gitignore
?? .gitleaks.toml
?? .husky/
?? .lintstagedrc.json
?? .node-version
?? .prettierignore
?? .prettierrc.json
?? AGENTS.md
?? apps/
?? commitlint.config.js
?? docker-compose.yml
?? docker/
?? docs/
?? eslint.config.js
?? package.json
?? packages/
?? pnpm-lock.yaml
?? pnpm-workspace.yaml
?? scripts/
?? tsconfig.base.json
?? tsconfig.scripts.json
```

Se comprueba que `.env`, `node_modules/` y `apps/web/dist/` no aparecen en `git status --short` porque están correctamente ignorados.

---

## 4. Variables de entorno (solo nombres, nunca valores)

Las 30 variables definidas en `.env.example` y verificadas en `.env` mediante `pnpm env:check`:

1. `NODE_ENV`
2. `APP_URL`
3. `API_HOST`
4. `API_PORT`
5. `CORS_ALLOWED_ORIGINS`
6. `LOG_LEVEL`
7. `POSTGRES_USER`
8. `POSTGRES_PASSWORD`
9. `POSTGRES_DB`
10. `DATABASE_URL`
11. `JWT_ISSUER`
12. `JWT_AUDIENCE`
13. `JWT_ACCESS_TTL`
14. `JWT_REFRESH_TTL_DAYS`
15. `JWT_PRIVATE_KEY`
16. `JWT_PUBLIC_KEY`
17. `COOKIE_SECURE`
18. `GOOGLE_OAUTH_CLIENT_ID`
19. `GOOGLE_OAUTH_CLIENT_SECRET`
20. `GOOGLE_OAUTH_REDIRECT_URI`
21. `SMTP_HOST`
22. `SMTP_PORT`
23. `SMTP_USER`
24. `SMTP_PASSWORD`
25. `SMTP_FROM`
26. `STORAGE_DIR`
27. `SEED_ADMIN_EMAIL`
28. `SEED_ADMIN_PASSWORD`
29. `VITE_API_BASE_URL` _(pública frontend)_
30. `VITE_APP_NAME` _(pública frontend)_

Salida de `pnpm env:check`:

```text
.env completo: 30 variables esperadas presentes (no se muestran valores).
```

---

## 5. Puertos y enlaces de red

| Servicio                         | Dirección y puerto local | Exposición                        | Notas                                        |
| -------------------------------- | ------------------------ | --------------------------------- | -------------------------------------------- |
| PostgreSQL 17 (`db`)             | `127.0.0.1:5432`         | Solo loopback local (`127.0.0.1`) | Nunca expuesto en `0.0.0.0`.                 |
| Mailpit SMTP (`mailpit`)         | `127.0.0.1:1025`         | Solo loopback local (`127.0.0.1`) | Captura de correos en desarrollo.            |
| Mailpit UI (`mailpit`)           | `127.0.0.1:8025`         | Solo loopback local (`127.0.0.1`) | Interfaz web local de inspección de correos. |
| API Fastify (`apps/api`)         | `127.0.0.1:3000`         | Loopback local                    | En desarrollo y en perfil Docker `full`.     |
| Web Vite (`apps/web`, dev)       | `127.0.0.1:5173`         | Loopback local                    | Con proxy `/api` → `http://127.0.0.1:3000`.  |
| Web Nginx (`web`, perfil `full`) | `127.0.0.1:8080`         | Loopback local                    | Con proxy `/api/` → `http://api:3000/api/`.  |

---

## 6. Revisión de Docker Compose y Dockerfiles

- **Sin credenciales por defecto:** `docker-compose.yml` exige `${POSTGRES_PASSWORD:?define POSTGRES_PASSWORD}`, `${JWT_PRIVATE_KEY:?define JWT_PRIVATE_KEY}`, `${JWT_PUBLIC_KEY:?define JWT_PUBLIC_KEY}` y `${SEED_ADMIN_PASSWORD:?define SEED_ADMIN_PASSWORD}`. Si falta alguna, Docker Compose aborta antes de crear contenedores.
- **Puerto de base de datos local:** `"127.0.0.1:5432:5432"`.
- **Volúmenes con nombre:** `tap_pgdata`, `tap_mailpit` y `tap_storage`.
- **Rol de PostgreSQL sin privilegios de superusuario:** `docker/init/01-init-app-role.sh` crea el rol `${POSTGRES_USER}` (`tap_app`) con `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS` y le otorga la propiedad de los esquemas `shared`, `access`, `organizations`, `people`, `events`, `attendance`, `certificates`, `inventory`, `loans`, `notifications`, `reports` y `pgboss`.
- **Dockerfiles multi-etapa y no root:** `docker/api.Dockerfile` ejecuta bajo el usuario `tap` y `docker/web.Dockerfile` usa `nginxinc/nginx-unprivileged:1.27-alpine` (`USER 101`), sin secretos en capas ni en directivas `ARG`.

---

## 7. Configuración de seguridad: Cookies, CORS, Helmet y JWT

- **Cookies de refresco:** emitidas con `HttpOnly; SameSite=Strict; Path=/api/v1/auth` y flag `Secure` gobernado por `COOKIE_SECURE` (`true` en producción). Gracias al proxy `/api` en Vite (desarrollo) y Nginx (producción), web y API comparten el mismo sitio (`SameSite=Strict`), impidiendo ataques CSRF sin requerir tokens adicionales.
- **Rutas públicas vs autenticadas:**
  - Rutas públicas (`/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/google`, `/api/v1/attendance/public/lookup`, `/api/v1/attendance/public/checkin`, `/c/:code`, `/p/:code`, `/v/:code`): no exigen JWT, aplican rate limiting estricto o por IP + evento, y jamás exponen datos personales completos.
  - Rutas privadas de funcionario (`/api/v1/events/*`, `/api/v1/organizations/*`, `/api/v1/people/*`, `/api/v1/attendance/events/*`): exigen token de acceso en cabecera `Authorization: Bearer`, validan rol y pertenencia de entidad (`organization_id`), con revocación por inactividad comprobada cada 60 s.
- **CORS (`@fastify/cors`):** lista blanca estricta tomada de `CORS_ALLOWED_ORIGINS` (separada por comas y validada con Zod al arrancar). Cualquier origen fuera de la lista es rechazado.
- **Helmet (`@fastify/helmet`):** activo en todas las respuestas con `Content-Security-Policy` restrictiva (`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self' data: blob:`, `object-src 'none'`, `frame-ancestors 'none'`) y `Cross-Origin-Resource-Policy: same-origin`.
- **JWT (algoritmo y vigencias, sin claves):**
  - Algoritmo de firma: `EdDSA` sobre curva `Ed25519` (par PKCS#8 / SPKI generado por `pnpm setup:env`). Lista blanca que rechaza terminantemente `none` y firmas simétricas.
  - Vigencia del token de acceso (`JWT_ACCESS_TTL`): `15m` (en memoria del cliente, nunca en `localStorage`).
  - Vigencia del token de refresco (`JWT_REFRESH_TTL_DAYS`): `7` días por rotación (almacenando solo el hash SHA-256 en base de datos con detección de reutilización y revocación en cascada de la familia de tokens).
  - Emisor (`JWT_ISSUER`): `tap-api`; Audiencia (`JWT_AUDIENCE`): `tap-web`.

---

## 8. Dependencias instaladas

El detalle completo de cada paquete (versión exacta, licencia y justificación) se encuentra en [`docs/dependencias.md`](./dependencias.md). Resumen:

- **Raíz (calidad y pruebas):** `typescript@6.0.3`, `@types/node@24.19.2`, `eslint@10.14.0`, `@eslint/js@10.0.1`, `typescript-eslint@8.72.1`, `eslint-plugin-boundaries@7.4.1`, `eslint-import-resolver-typescript@4.4.5`, `eslint-plugin-react-hooks@7.1.1`, `globals@17.14.0`, `prettier@3.9.10`, `husky@9.1.7`, `lint-staged@17.6.0`, `@commitlint/cli@21.2.4`, `@commitlint/config-conventional@21.2.4`, `vitest@5.1.0`.
- **`@tap/contracts`:** `zod@4.6.7`.
- **`@tap/api`:** `fastify@5.12.8`, `fastify-type-provider-zod@7.0.0`, `@fastify/helmet@13.2.0`, `@fastify/cors@11.4.0`, `@fastify/swagger@9.9.3`, `drizzle-orm@0.45.4`, `pg@8.23.1`, `pg-boss@12.38.0`, `pino@10.4.0`, `zod@4.6.7`, `drizzle-kit@0.31.11`, `tsx@4.23.15`, `esbuild@0.28.2`, `@types/pg@8.23.1`, `pino-pretty@13.2.0`, `@testcontainers/postgresql@12.2.1`.
- **`@tap/web`:** `react@19.3.1`, `react-dom@19.3.1`, `react-router@7.18.0`, `recharts@3.10.1`, `lucide-react@1.16.0`, `@fontsource-variable/inter@5.2.8`, `@fontsource-variable/jetbrains-mono@5.2.9`, `vite@8.1.3`, `@vitejs/plugin-react@6.0.1`, `tailwindcss@4.2.2`, `@tailwindcss/vite@4.2.2`, `@types/react@19.2.14`, `@types/react-dom@19.2.3`.

---

## 9. Resultados de `pnpm audit`, `pnpm check:secrets` y `pnpm check:bundle`

### `pnpm audit`

- Tras aplicar `overrides` seguros en `pnpm-workspace.yaml` para `esbuild` (`^0.28.2`) y `glob` (`^14.0.2`), `pnpm audit` reporta **0 vulnerabilidades críticas, 0 altas y 1 moderada** en una subdependencia transitiva de tiempo de desarrollo (`minimatch` dentro de `@eslint/config-array`, advisory `GHSA-g3hv-75wg-m249`, que no forma parte del servidor ni del cliente en producción y cuya versión `11.x` rompe compatibilidad de API con paquetes que consumen `minimatch@3/9/10`).

### `pnpm check:secrets` (Gitleaks v8.30.1)

```text
12:23PM INF scanned ~284761 bytes (284.76 KB) in 39.1ms
12:23PM INF no leaks found
check:secrets [árbol de trabajo]: sin hallazgos
12:23PM INF 0 commits scanned.
12:23PM INF scanned ~0 bytes (0) in 559ms
12:23PM INF no leaks found
check:secrets [área de preparación]: sin hallazgos
```

### `pnpm check:bundle`

```text
check:bundle OK: 3 archivos del bundle revisados, sin secretos ni variables sensibles.
```

---

## 10. Hooks de Git activos

- `git config --get core.hooksPath` → `.husky/_`
- `.husky/pre-commit`: ejecuta `pnpm exec lint-staged` y `pnpm check:secrets`.
- `.husky/commit-msg`: ejecuta `pnpm exec commitlint --edit "$1"`.
