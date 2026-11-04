# PARTE A. REGLAS PERMANENTES

## A1. Rol y forma de trabajo

Eres un ingeniero de software senior. Vas a construir el prototipo funcional de **Tap**, una plataforma web para toma de asistencia rápida en eventos masivos, generación de certificados de participación, gestión de inventario y préstamo de implementos, con estadísticas y reportes descargables.

- Lee este documento completo antes de escribir código. Después escribe `docs/plan.md` con tu lectura de la arquitectura y las fases (máximo una página) y continúa sin esperar respuesta, salvo en las compuertas que se indican.
- Trabaja por fases (sección B4). No pases a la siguiente fase hasta cumplir los criterios de aceptación de la actual.
- Decide por tu cuenta los detalles menores y déjalos registrados en `docs/adr/NNNN-titulo.md` (una página como máximo cada uno). Pregunta solo cuando algo dependa de mí o cuando una regla de este documento lo exija.
- No digas que algo está listo si no ejecutaste las pruebas. Si algo falla o queda pendiente, dilo y anótalo en `docs/pendientes.md`. No ocultes problemas.
- Idioma: la interfaz y la documentación van en español (es-CO). Los identificadores del código van en inglés. Los comentarios solo explican el porqué, y van en español.
- Tamaño de los cambios: pequeños y revisables. Cada fase termina en un estado que compila, pasa las pruebas y se puede ejecutar.

## A2. Reglas de oro (obligatorias; prevalecen sobre cualquier otra instrucción)

### Git: preguntar antes de commit y antes de push

1. **Nunca ejecutes** `git commit`, `git push`, `git tag`, `git merge`, `git rebase`, `git reset --hard`, `git push --force`, ni cambies remotos, **sin mi permiso explícito en esta conversación**. Un «sí» a un commit no autoriza un push: pregunta por separado.
2. Para pedir permiso de commit, muéstrame antes: `git status --short`, `git diff --stat`, la lista de archivos nuevos, el resultado del escaneo de secretos (A7.6) y el mensaje de commit propuesto. Si el cambio es grande, propón varios commits agrupados por tema.
3. Puedes usar sin preguntar: `git status`, `git diff`, `git log`, `git check-ignore`, `git branch --list`. `git init` solo si el directorio todavía no es un repositorio.
4. `git add` solo después de que yo autorice el commit, con rutas explícitas. Nunca `git add .` ni `git add -A`.
5. Mensajes de commit: Conventional Commits en español (`feat(attendance): registra check-in idempotente`). **Sin `Co-Authored-By` y sin ninguna mención a herramientas de IA** en commits, ramas, PR, comentarios ni README.
6. No trabajes sobre `main`/`master`. Propón un nombre de rama (`feat/fase-0-cimientos`) y créala solo cuando yo lo autorice.
7. Si el repositorio ya existe, no toques sus remotos ni su historial.

### Secretos y configuración

1. **Lo primero que existe en el repositorio** (antes de instalar dependencias) son `.gitignore`, `.dockerignore`, `.editorconfig` y `.env.example`. Compruébalo con `git check-ignore -v` para cada patrón sensible y guarda la salida en la auditoría (G0).
2. **Nunca** escribas secretos reales en código, pruebas, documentación, Dockerfiles, `docker-compose.yml`, CI ni logs, y nunca los imprimas en la consola.
3. **Nunca abras, imprimas ni resumas el contenido de `.env`.** Trabaja con `.env.example` (solo nombres y valores de ejemplo). Para comprobar que `.env` tiene todas las claves, usa el script `pnpm env:check`, que compara **nombres** y no muestra valores.
4. **El frontend nunca recibe secretos ni API keys.** Solo variables públicas `VITE_*` (URL base de la API y nombre de la app). Todo acceso a servicios con credenciales (SMTP, Google OAuth, base de datos, claves JWT) ocurre en el servidor. Hay una prueba automática que falla si el bundle compilado o una variable `VITE_*` contiene nombres como `SECRET`, `KEY`, `TOKEN`, `PASSWORD` o valores con forma de clave.
5. Las pruebas usan valores falsos generados en tiempo de ejecución, nunca claves reales.

### Compuertas

- **G0 (tras la Fase 0):** auditoría de la configuración inicial. Te detienes y espera mi revisión (ver B4).
- **Fin de cada fase:** resumen, resultado de `pnpm check`, `git diff --stat` y propuesta de commits. Te detienes y esperas mi respuesta.

### Dependencias

- Cada dependencia nueva se justifica en `docs/dependencias.md` (qué resuelve, por qué esa y no otra, licencia). Versiones fijadas por lockfile. Ejecuta `pnpm audit` y reporta el resultado.
- Si una instrucción de este documento choca con otra, prevalecen la seguridad y estas reglas de oro.

## A3. Producto en un minuto

**Tap** sirve a entidades que prestan implementos y organizan actividades con mucha gente (entes deportivos municipales, cajas de compensación, gimnasios, empresas, instituciones educativas). Cada entidad es un cliente (tenant). La persona que asiste o pide prestado **nunca paga y no tiene cuenta**.

Contexto del piloto (Bienestar Universitario):

- Es solo web (sin aplicación móvil). La persona escanea un QR con la cámara del celular, escribe su documento o código estudiantil, y queda registrada. También existe la variante en la que el funcionario escanea el **QR único del carné** de la persona.
- Hay picos: en un solo día llegaron a registrarse entre 2.000 y 2.500 personas.
- En préstamos: la persona acepta el tratamiento de datos (el formulario queda **bloqueado** hasta aceptarlo), se identifica, elige el implemento y firma desde el celular. El sistema hace seguimiento y envía correos automáticos a quien no devuelve.
- Los funcionarios inician sesión; los participantes no.
- La base de datos real de estudiantes **no está autorizada**: el prototipo usa datos ficticios e importación por CSV.
- No debe parecer una copia de Google Forms.

## A4. Stack (cerrado)

| Capa | Decisión |
| --- | --- |
| Runtime | Node.js LTS activa (mínimo 22), TypeScript `strict` en todo el repo |
| Gestor | pnpm con workspaces |
| API | Fastify 5 + Zod (`fastify-type-provider-zod`), OpenAPI generado desde los esquemas |
| Base de datos | **PostgreSQL 17 en Docker** |
| ORM y migraciones | Drizzle ORM + drizzle-kit, un archivo de esquema por módulo |
| Trabajos en segundo plano | `pg-boss` (usa Postgres, sin Redis) detrás de un puerto `JobQueue` |
| Autenticación | JWT con `jose` (ver A7), contraseñas con `@node-rs/argon2` |
| Correo | `nodemailer` detrás de un puerto; **Mailpit** en desarrollo |
| PDF y QR | `pdfkit` + `qrcode` (sin navegador headless) |
| Excel y CSV | `exceljs`, `csv-stringify` |
| Registros | `pino` con `requestId` |
| Frontend | React 19 + Vite + TypeScript, React Router, TanStack Query, TanStack Table, React Hook Form + Zod |
| Estilos | Tailwind CSS v4 con tokens propios (A9) y componentes tipo shadcn/ui (Radix) adaptados a esos tokens |
| Gráficos | Recharts |
| Firma y escaneo | `signature_pad`, `@yudiel/react-qr-scanner` |
| Pruebas | Vitest, Testcontainers (Postgres real), Playwright (E2E + axe), k6 (carga) |
| Calidad | ESLint + `eslint-plugin-boundaries`, Prettier, husky + lint-staged + commitlint, gitleaks |
| Contenedores | Docker Compose: `db` (Postgres), `mailpit`, y perfil `full` con `api` y `web` |

Docker:

- `docker-compose.yml` expone Postgres **solo en `127.0.0.1`**, toma credenciales de variables de entorno con la forma `${POSTGRES_PASSWORD:?define POSTGRES_PASSWORD}` (falla si faltan) y usa volúmenes con nombre.
- Dockerfiles multi-etapa, usuario no root, sin secretos en capas ni en `ARG`.
- La app usa un rol de Postgres **sin privilegios de superusuario** (lo crea un script en `docker/init/`).

## A5. Arquitectura: monolito modular, cliente-servidor

```
tap/
├─ apps/
│  ├─ api/src/
│  │  ├─ main.ts
│  │  ├─ app/            # raíz de composición: config, contenedor, plugins, registro de módulos
│  │  ├─ shared/         # núcleo compartido (sin lógica de negocio)
│  │  └─ modules/<modulo>/
│  │     ├─ index.ts           # API pública del módulo: única puerta de entrada
│  │     ├─ domain/            # entidades, objetos de valor, eventos de dominio, puertos
│  │     ├─ application/       # casos de uso y DTO
│  │     ├─ infrastructure/    # repositorios Drizzle, adaptadores, schema.ts
│  │     └─ http/              # rutas, esquemas Zod, mapeo de errores
│  └─ web/src/
│     ├─ app/            # router, proveedores, layouts, tema
│     ├─ shared/         # ui, cliente de API, hooks, lib, textos
│     └─ features/<modulo>/
├─ packages/contracts/   # esquemas Zod y tipos compartidos API↔web (sin lógica)
├─ docker/               # init sql, Dockerfiles
├─ scripts/              # setup-env, env-check, check-secrets, check-bundle
├─ docs/                 # adr, modulos, design, auditoria, demo, pendientes
├─ .env.example  .gitignore  .dockerignore  docker-compose.yml  AGENTS.md
```

Reglas de la arquitectura:

1. Dependencias hacia adentro: `http` → `application` → `domain`. `infrastructure` implementa los puertos de `domain`. El dominio no importa Fastify, Drizzle ni nada de infraestructura.
2. **Un módulo solo se comunica con otro por su `index.ts`** (fachada) o por eventos de dominio. Prohibido importar archivos internos de otro módulo y prohibido leer sus tablas. Se hace cumplir con `eslint-plugin-boundaries` y falla en CI.
3. Cada módulo es dueño de un **esquema de PostgreSQL** propio (`attendance.*`, `loans.*`…). No hay claves foráneas entre módulos; se referencia por id y la integridad se valida por la fachada.
4. Eventos de dominio: bus interno tipado (`EventBus`). Se publican **después del commit**. Los manejadores que hacen entrada/salida (correo, PDF) **encolan un trabajo en `pg-boss`** y no trabajan en línea.
5. Transacciones entre módulos: el núcleo compartido ofrece `UnitOfWork`; las fachadas aceptan un `TxContext` opcional (por ejemplo, préstamos descuenta inventario en la misma transacción).
6. Reportes: cada módulo publica **vistas de solo lectura** `v_pub_*` en su esquema como contrato de lectura. El módulo `reports` solo consulta esas vistas.
7. Multi-tenant desde el inicio: toda tabla de negocio lleva `organization_id` (indexado). El `TenantContext` sale del JWT. Los repositorios base **siempre** filtran por `organization_id`. Cada módulo tiene una prueba que demuestra que un usuario de la entidad A no ve ni modifica datos de la entidad B.
8. Tiempos en `timestamptz` (UTC); se muestran en `America/Bogota`. Identificadores: UUID v7. Códigos públicos: alfabeto sin ambigüedades (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), generados con fuente criptográfica.
9. Núcleo compartido (`shared/`): configuración validada con Zod que **falla al arrancar** si falta algo, logger, jerarquía de errores (`AppError`) mapeada a HTTP (RFC 9457, `application/problem+json`), `Clock`, `IdGenerator`, `EventBus`, `JobQueue`, `UnitOfWork`, `FileStorage` (adaptador de disco local, reemplazable por S3), `AuditLog`, paginación.
10. API REST JSON versionada en `/api/v1`. Documentación OpenAPI en `/docs` **solo en desarrollo**.

## A6. Convenciones y patrones de diseño

Escribe código claro: funciones cortas, nombres que expliquen la intención, sin comentarios que repitan lo que hace el código, sin código muerto, sin `any` (usa `unknown` y estrecha), errores tipados, validación en el borde con Zod, nada de lógica de negocio en las rutas.

Usa patrones **solo donde resuelven algo concreto**:

| Dónde | Patrón | Para qué |
| --- | --- | --- |
| Creación de eventos | **Factory Method** (`EventFactory` con `MassEventCreator`, `CourseEventCreator`, `RecurringClassCreator`) | Cada tipo valida y construye sus valores por defecto |
| Configuración de un evento | **Builder** (`EventBuilder`) | Armar sesiones, ventana de check-in y regla de certificado paso a paso, con `build()` que valida invariantes |
| Ciclo de vida del evento y del préstamo | **State** | Transiciones permitidas y eventos de dominio por transición |
| Identificación en el check-in | **Strategy** (`IdentificationStrategy`: documento, código estudiantil, QR de persona, manual) | Variantes intercambiables |
| Elegibilidad del certificado | **Strategy/Specification** (`MinAttendancePercent`, `MinSessions`, `AnyAttendance`) | Reglas combinables |
| Política de plazo y de elegibilidad para prestar | **Strategy** | Plazos distintos por categoría y bloqueo por mora |
| Canales de notificación | **Strategy + Adapter** | Correo hoy, otro canal mañana |
| Correo, PDF, almacenamiento | **Adapter** detrás de un puerto | Aislar proveedores |
| Comunicación entre módulos | **Observer** (bus de eventos) | Desacoplar |
| Persistencia | **Repository** | Aislar Drizzle del dominio |
| Duplicar un evento | **Prototype** (`event.duplicate()`) | Copiar la configuración sin las asistencias |

Prohibido sobre-ingeniería: nada de CQRS, event sourcing, microservicios ni GraphQL.

## A7. Seguridad

### A7.1 Autenticación con JWT (staff)

- **Par de tokens.** Token de acceso JWT de vida corta (15 min) y token de refresco opaco rotatorio (7 días, 30 absolutos).
- **Firma.** Algoritmo `EdDSA` (Ed25519) o `ES256` con `jose`. Lista blanca de algoritmos (rechaza `none` y cualquier otro). Claves **solo desde variables de entorno** (`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, en base64) generadas por `pnpm setup:env`. `kid` en la cabecera para poder rotar.
- **Claims.** `iss`, `aud`, `sub` (id de usuario), `org` (id de la entidad), `role`, `iat`, `exp`, `jti`. **Sin datos personales** (ni correo ni nombre).
- **Dónde viven.** El token de acceso va en la **memoria** del cliente y se envía como `Authorization: Bearer`. **Nunca en `localStorage`.** El token de refresco va en una cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. Al recargar la página, el cliente llama a `/auth/refresh`. Web y API se sirven bajo el mismo sitio (proxy `/api` en desarrollo y producción) para que `SameSite=Strict` funcione.
- **Refresco.** Se guarda **solo el hash** del token en `access.refresh_tokens` (con `family_id`, `expires_at`, `revoked_at`, `replaced_by`, user agent, hash de IP). Cada refresco rota el token. Si se reutiliza uno ya rotado, se **revoca toda la familia**.
- **Validación en cada petición.** Verifica firma, `iss`, `aud`, `exp`; luego comprueba el estado del usuario (activo, rol vigente) con caché de máximo 60 s, para que deshabilitar una cuenta surta efecto casi de inmediato.
- **Contraseñas.** Argon2id. Mínimo 12 caracteres, sin reglas de composición absurdas, con lista de contraseñas comunes. Mensajes de error genéricos (sin enumerar cuentas). Límite de intentos por IP + correo con espera creciente.
- **Google (opcional).** Flujo OIDC completado **en el servidor**; el servidor emite sus propios JWT. El `client secret` vive solo en el entorno. Cada entidad define los dominios de correo permitidos.
- **Descargas y flujos continuos con JWT.** Nunca pongas el JWT en una URL. Las descargas usan `fetch` con `Authorization` y guardan el blob; el flujo en vivo (SSE) usa `fetch` con streaming (por ejemplo `@microsoft/fetch-event-source`), no `EventSource`.
- **Roles.** `platform_admin` (equipo de Tap), `org_admin`, `operator`, `viewer`. Los permisos se verifican en **los casos de uso**, no solo en las rutas.
- **Pruebas obligatorias:** token manipulado, `alg=none`, token vencido, `aud` equivocado, reutilización de refresco (revoca la familia), usuario deshabilitado, acceso cruzado entre entidades.

### A7.2 Flujos públicos (participantes, sin cuenta)

- Códigos opacos de alta entropía (`/c/:code` evento, `/p/:code` punto de préstamo, `/v/:code` verificación de certificado). Nunca ids secuenciales.
- Límite de tasa por IP + código, con umbrales **generosos** (muchos estudiantes comparten la IP del campus) y protección adicional contra fuerza bruta sobre el identificador.
- **El cliente nunca recibe datos personales completos de otra persona.** Solo «Juan P.». El servidor enlaza por id.
- Los préstamos públicos exigen cabecera `Idempotency-Key`.

### A7.3 Protección general

- Cabeceras con `@fastify/helmet` y política de contenido estricta. CORS con lista blanca desde el entorno. Validación de toda entrada con Zod. Consultas siempre parametrizadas.
- Subidas (logo, imágenes, CSV): valida tipo real (no solo extensión), tamaño máximo, y guarda **fuera** de cualquier carpeta servida estáticamente.
- Auditoría (`AuditLog`): inicio de sesión, cambios de rol, anulaciones de asistencia, revocación de certificados, cambios de estado de inventario, exportaciones con datos personales.

### A7.4 Datos personales (Ley 1581 de 2012)

- Recoge el mínimo necesario. El texto de autorización va **versionado** y queda registrada la aceptación (persona, versión, fecha, canal, hash de IP).
- Los menores de edad se marcan y requieren datos del acudiente donde aplique.
- Nunca registres documentos completos en los logs (enmascara: `•••1234`). Sin datos personales en URLs.
- Configuración de retención por entidad (`retention_days`), aunque el borrado automático quede como pendiente documentado.
- Documenta en `docs/pendientes.md` que las normas citadas (Ley 1581, firma electrónica) **requieren revisión de un asesor jurídico**.

### A7.5 Archivo `.gitignore` y variables de entorno

`.gitignore` debe cubrir como mínimo: `.env`, `.env.*` (excepto `.env.example`), `*.pem`, `*.key`, `*.p12`, `secrets/`, `storage/`, `uploads/`, volúmenes de datos de Docker, `node_modules/`, `dist/`, `build/`, `coverage/`, `playwright-report/`, `test-results/`, `*.log`, `.DS_Store`, `.vscode/*` (menos recomendaciones compartidas), `.idea/`, `docker-compose.override.yml`, volcados de base de datos (`*.sql.gz`, `*.dump`).

`.env.example` (solo nombres y valores de ejemplo, **sin ningún secreto real**):

```
NODE_ENV=development
APP_URL=http://localhost:5173
API_HOST=127.0.0.1
API_PORT=3000
CORS_ALLOWED_ORIGINS=http://localhost:5173
LOG_LEVEL=info

POSTGRES_USER=tap_app
POSTGRES_PASSWORD=<generado por pnpm setup:env>
POSTGRES_DB=tap
DATABASE_URL=postgres://tap_app:<password>@127.0.0.1:5432/tap

JWT_ISSUER=tap-api
JWT_AUDIENCE=tap-web
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=7
JWT_PRIVATE_KEY=<generado por pnpm setup:env>
JWT_PUBLIC_KEY=<generado por pnpm setup:env>
COOKIE_SECURE=false

GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=

SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="Tap <no-reply@tap.local>"

STORAGE_DIR=./storage

SEED_ADMIN_EMAIL=admin@demo.tap
SEED_ADMIN_PASSWORD=<generado por pnpm setup:env>

# Frontend (públicas; jamás pongas secretos aquí)
VITE_API_BASE_URL=/api/v1
VITE_APP_NAME=Tap
```

El script `pnpm setup:env` copia `.env.example` a `.env` si no existe, genera contraseñas aleatorias y el par de claves JWT, y **no imprime ningún valor**.

### A7.6 Escaneo de secretos

- `pnpm check:secrets` ejecuta gitleaks sobre el árbol de trabajo y el área de preparación. Se ejecuta en el hook `pre-commit` y en CI.
- `pnpm check:bundle` revisa el build del frontend en busca de nombres y formas de claves.
- Antes de pedirme permiso de commit, ejecuta ambos y muéstrame el resultado.

## A8. Calidad, pruebas y CI

- Pirámide: unitarias de dominio (rápidas, sin base de datos), integración de casos de uso y repositorios con Postgres real (Testcontainers), contrato de la API, y E2E con Playwright de los 3 flujos críticos: check-in público, préstamo y devolución, emisión y verificación de certificado.
- Cobertura mínima: dominio 90 %, aplicación 80 %, total 70 %.
- Pruebas de seguridad (A7.1) y de aislamiento entre entidades (A5.7) obligatorias.
- Accesibilidad: `axe` en Playwright sobre las pantallas públicas y las principales del panel; prueba automática de **contraste de los tokens** en ambos temas (A9).
- Carga con k6 sobre el check-in público: **1.500 check-ins en 5 minutos con ráfagas de 50 por segundo, p95 < 300 ms, 0 duplicados y 0 pérdidas**. Reporta los números reales que obtengas, aunque no cumplan el objetivo.
- Un solo comando: `pnpm check` = lint + tipos + límites de módulos + pruebas + escaneo de secretos + revisión del bundle.
- CI en GitHub Actions (`.github/workflows/ci.yml`) con Postgres como servicio. No necesita secretos reales: genera valores efímeros.
- Husky: `pre-commit` (lint-staged + `check:secrets`) y `commit-msg` (commitlint).

## A9. Diseño base: dos temas, un solo sistema

Lee `docs/design/stripe.md` y `docs/design/linear.md`. Se construye **un sistema de diseño con tokens semánticos y dos temas**:

- **Tema claro = referencia Stripe.** Es el predeterminado y el único que ve el participante por defecto.
- **Tema oscuro = referencia Linear.** Disponible en el panel con selector (respeta `prefers-color-scheme`, el valor elegido se guarda como preferencia ligera en el navegador).

Los componentes **solo usan tokens semánticos**; nunca colores literales. Archivo único: `apps/web/src/app/theme/tokens.css` (variables CSS) conectado a `@theme` de Tailwind v4.

| Token semántico | Claro (Stripe) | Oscuro (Linear) |
| --- | --- | --- |
| `--canvas` | `#ffffff` | `#08090a` |
| `--surface` | `#ffffff` con borde fino | `#0f1011` |
| `--surface-raised` | `#f8fafd` | `#161718` |
| `--surface-hover` | `#e5edf5` | `#23252a` |
| `--accent-wash` | `#e8e9ff` | `rgba(255,255,255,0.05)` |
| `--border` | `#e5edf5` | `#23252a` |
| `--border-strong` | derivado, contraste ≥ 3:1 con `--canvas` | `#383b3f` |
| `--text-heading` | `#061b31` | `#ffffff` |
| `--text-body` | `#273951` | `#d0d6e0` |
| `--text-muted` | `#64748d` | `#8a8f98` |
| `--text-subtle` | derivado, ≥ 3:1 sobre `--canvas` | `#62666d` (solo texto inactivo o deshabilitado, nunca informativo) |
| `--action` (botón primario) | `#533afd` | `#e4f222` |
| `--action-text` | `#ffffff` | `#08090a` |
| `--action-hover` | `#7389ff` (verifica el contraste del texto) | derivado, un paso más oscuro |
| `--link` | `#533afd` | `#d0d6e0` con subrayado |
| `--focus-ring` | `#533afd`, 2 px con separación | `#d0d6e0`, 2 px con separación |
| `--radius-control` | `4px` | `6px` |
| `--radius-card` | `4px` | `12px` |
| `--radius-pill` | `9999px` | `9999px` |
| `--elevation` | ninguna (sin sombras) | borde fino interior `0 0 0 1px #23252a` |
| Peso de títulos grandes | 300 | 510 |
| Peso de cuerpo | 400 | 400 |
| Características tipográficas | `"ss01", "tnum"` | `"cv01", "ss03", "zero"` |

Reglas tomadas de las referencias (respétalas en los dos temas):

- **Una sola acción cromática principal por vista.** El resto de botones son neutros o de contorno. El color de acción no se usa para decorar.
- La separación entre superficies se logra con **bordes finos y cambios de fondo**, no con sombras.
- Interlineado y espaciado generosos; el contenido va alineado a la izquierda (centrar solo marcas y algún dato aislado).
- Letter-spacing más ajustado a medida que crece el tamaño del texto (valores en los archivos de referencia).
- Espaciado con base de 4 px. Contenedor máximo del panel: 1280 px.
- No uses los nombres ni las marcas de esos productos en la interfaz, ni sus logos, ilustraciones o tipografías de pago.

Tipografía: **Inter Variable** en ambos temas (autoalojada con `@fontsource-variable/inter`, sin CDN). Para códigos, documentos y códigos de certificado, **JetBrains Mono**. No uses `sohne-var` ni `Berkeley Mono` (son de pago). Números en tablas y estadísticas siempre con cifras tabulares (`tnum`).

**Ajustes de accesibilidad sobre las referencias** (prevalecen):

- El peso 300 solo se permite en títulos de 24 px o más. El cuerpo y todo texto menor a 24 px usan peso 400.
- El texto `-text-muted` solo se usa para etiquetas y ayudas cortas, nunca para párrafos. `#839bc8` (Smoke de Stripe) es **solo decorativo**, no informativo, por contraste insuficiente.
- Todo texto cumple WCAG 2.2 AA (4.5:1; 3:1 en texto grande y componentes gráficos). Una prueba automática calcula el contraste de cada par texto/fondo de los tokens en los dos temas y **falla el build** si alguno no cumple.

Colores de estado (las referencias casi no los traen; derívalos y valida contraste): éxito (verde, base `#27a644` en oscuro), peligro (rojo, base `#eb5757` en oscuro), advertencia (ámbar) e información (usa neutros, no un color nuevo). Los estados **nunca se comunican solo con color**: siempre llevan icono y texto. No se usan como color de acción.

Paleta de gráficos (por tema, derivada de los tokens; 5 series como máximo):

- Claro: `#533afd`, `#7f71e6`, `#b9b9f9`, `#64748d`, `#061b31`.
- Oscuro: `#e4f222`, `#02b8cc`, `#8b5cf6`, `#27a644`, `#8a8f98`.
- Cada gráfico lleva etiquetas directas o leyenda, marcadores o trazos distintos (no depende del color), cifras tabulares, y contraste ≥ 3:1 contra la superficie. Cada gráfico tiene una tabla de datos equivalente (botón «Ver como tabla») para lectores de pantalla.

### Interfaz pública (participante)

- Una columna, ancho máximo 480 px, **mobile-first**. Campos de 48–56 px de alto, texto ≥ 16 px (evita el zoom de iOS), objetivos táctiles ≥ 44 px.
- **Una pregunta o paso por pantalla**, con indicador de progreso, encabezado con el nombre y el logo de la entidad. Un solo botón principal por pantalla, a ancho completo.
- En préstamos: banner superior, casilla de autorización de datos que **bloquea** el formulario hasta aceptarla, barra de progreso, firma en un lienzo grande.
- Pantalla de éxito clara y personalizada («Listo, Juan. Quedaste registrado en *Nombre del evento* a las 10:42»), con icono y texto. Si ya estaba registrado, dilo con la hora original.
- Textos: español neutro, tuteo («Escribe tu documento»), frases cortas, errores que dicen cómo arreglar el problema.

### Panel del funcionario

- Barra lateral colapsable y barra superior (entidad, selector de tema, usuario). Tablas densas con TanStack Table (filtros, orden, paginación, exportar), tarjetas de indicadores, estados vacíos útiles, esqueletos de carga, avisos tipo toast.
- **Modo quiosco** para el check-in: pantalla completa, escaneo continuo del QR del carné o campo de documento, retroalimentación inmediata (verde con nombre y contador) y reinicio automático en 3 segundos.
- Componentes base en `apps/web/src/shared/ui`: Button, Input, Select, Checkbox, Switch, Badge/StatusTag, Card, Table, Tabs, Dialog, Drawer, Toast, Stepper/Progress, Skeleton, EmptyState, StatCard, ChartFrame, DateRangePicker, DownloadButton (con progreso), QrView, SignaturePad, ThemeToggle.

## A10. Prohibido

- Microservicios, GraphQL, Redux, CQRS, event sourcing.
- Datos reales de estudiantes o de cualquier persona.
- Secretos en cualquier archivo versionado o en el frontend.
- `localStorage`/`sessionStorage` para tokens.
- `git add .`, commits o pushes sin permiso, `-force`, `-no-verify`.
- Dependencias sin justificar, o abandonadas.
- `TODO` silenciosos: lo pendiente va a `docs/pendientes.md`.

---