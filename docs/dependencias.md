# Justificación de dependencias (Fase 0 a Fase 7)

Todas las dependencias están fijadas por `pnpm-lock.yaml` y obedecen al stack cerrado de `AGENTS.md` (A4).

## Raíz del monorepo (`devDependencies`)

| Paquete                             | Versión instalada | Licencia   | Qué resuelve y por qué se eligió                                                                                                                                   |
| ----------------------------------- | ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `typescript`                        | `6.0.3`           | Apache-2.0 | Compilador y verificador estático con modo `strict` en todo el repositorio (se fijó `~6.0.0` por compatibilidad de `peerDependencies` con `typescript-eslint` v8). |
| `@types/node`                       | `24.19.2`         | MIT        | Definiciones de tipos para el runtime Node.js 24 LTS.                                                                                                              |
| `eslint`                            | `10.14.0`         | MIT        | Linter de código estático para aplicar reglas de calidad y arquitectura.                                                                                           |
| `@eslint/js`                        | `10.0.1`          | MIT        | Reglas base recomendadas de JavaScript para ESLint Flat Config.                                                                                                    |
| `typescript-eslint`                 | `8.72.1`          | MIT        | Parser y reglas TypeScript (`no-explicit-any`, `consistent-type-imports`) sobre ESLint.                                                                            |
| `eslint-plugin-boundaries`          | `7.4.1`           | MIT        | Hace cumplir las fronteras entre módulos (`index.ts`) y la dirección de dependencias (`http → application → domain`) exigidas en `AGENTS.md` A5.                   |
| `eslint-import-resolver-typescript` | `4.4.5`           | ISC        | Permite que `eslint-plugin-boundaries` resuelva rutas de TypeScript en los tres paquetes del monorepo.                                                             |
| `eslint-plugin-react-hooks`         | `7.1.1`           | MIT        | Verifica las reglas de los hooks de React 19 en `apps/web`.                                                                                                        |
| `globals`                           | `17.14.0`         | MIT        | Conjuntos de variables globales de Node y navegador para ESLint Flat Config.                                                                                       |
| `prettier`                          | `3.9.10`          | MIT        | Formateador único del repositorio.                                                                                                                                 |
| `husky`                             | `9.1.7`           | MIT        | Gestión de hooks de Git (`pre-commit` y `commit-msg`) exigida en `AGENTS.md` A8.                                                                                   |
| `lint-staged`                       | `17.6.0`          | MIT        | Ejecuta ESLint y Prettier sobre los archivos en preparación durante `pre-commit`.                                                                                  |
| `@commitlint/cli`                   | `21.2.4`          | MIT        | Valida el formato Conventional Commits en el hook `commit-msg`.                                                                                                    |
| `@commitlint/config-conventional`   | `21.2.4`          | MIT        | Reglas base de Conventional Commits adaptadas a mensajes en español.                                                                                               |
| `vitest`                            | `5.1.0`           | MIT        | Ejecutor de pruebas rápidas para dominio, contratos, componentes y contraste de tokens.                                                                            |
| `@playwright/test`                  | `1.64.1`          | Apache-2.0 | Pruebas E2E en navegador real de los flujos críticos (inicio/cierre de sesión, check-in, préstamos y certificados) (`AGENTS.md` A4, A8).                           |
| `@testcontainers/postgresql`        | `12.2.1`          | MIT        | Contenedores efímeros de PostgreSQL 17 real para el runner de pruebas E2E e integración (`AGENTS.md` A8).                                                          |

## `packages/contracts`

| Paquete | Versión instalada | Licencia | Qué resuelve y por qué se eligió                                                                       |
| ------- | ----------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `zod`   | `4.6.7`           | MIT      | Validación de esquemas y tipos compartidos entre API y web sin lógica de negocio (`AGENTS.md` A4, A5). |

## `apps/api`

| Paquete                              | Versión instalada | Licencia   | Qué resuelve y por qué se eligió                                                                                                       |
| ------------------------------------ | ----------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `fastify`                            | `5.12.8`          | MIT        | Servidor HTTP de alto rendimiento para soportar picos de check-in masivo (`AGENTS.md` A4).                                             |
| `fastify-type-provider-zod`          | `7.0.0`           | MIT        | Conecta esquemas Zod con la validación, serialización y generación OpenAPI de Fastify 5.                                               |
| `@fastify/helmet`                    | `13.2.0`          | MIT        | Cabeceras HTTP de seguridad y Content-Security-Policy estricta (`AGENTS.md` A7.3).                                                     |
| `@fastify/cors`                      | `11.4.0`          | MIT        | Control de orígenes permitidos por lista blanca desde variables de entorno (`AGENTS.md` A7.3).                                         |
| `@fastify/cookie`                    | `11.1.5`          | MIT        | Lectura y escritura de la cookie de refresco `HttpOnly; SameSite=Strict; Path=/api/v1/auth` (`AGENTS.md` A7.1).                        |
| `@fastify/swagger`                   | `9.9.3`           | MIT        | Generación de especificación OpenAPI 3 en `/docs` solo en desarrollo (`AGENTS.md` A5.10).                                              |
| `jose`                               | `6.2.15`          | MIT        | Firma y verificación de tokens JWT con `EdDSA` (Ed25519) y lista blanca de algoritmos (`AGENTS.md` A4, A7.1).                          |
| `@node-rs/argon2`                    | `2.2.2`           | MIT        | Hash de contraseñas con Argon2id en código nativo de alto rendimiento (`AGENTS.md` A4, A7.1).                                          |
| `drizzle-orm`                        | `0.45.4`          | Apache-2.0 | ORM ligero con soporte nativo para múltiples esquemas PostgreSQL (`pgSchema`) y consultas parametrizadas (`AGENTS.md` A4).             |
| `pg`                                 | `8.23.1`          | MIT        | Cliente y pool de conexiones para PostgreSQL 17.                                                                                       |
| `pg-boss`                            | `12.38.0`         | MIT        | Cola de trabajos en segundo plano sobre PostgreSQL sin depender de Redis (`AGENTS.md` A4).                                             |
| `pino`                               | `10.4.0`          | MIT        | Logger estructurado JSON con soporte de `requestId` y redacción de campos sensibles (`AGENTS.md` A4).                                  |
| `pdfkit`                             | `0.20.2`          | MIT        | Generación en servidor de afiches A4 en PDF de eventos y certificados sin navegador headless (`AGENTS.md` A4).                         |
| `qrcode`                             | `1.5.4`           | MIT        | Generación en servidor de códigos QR en PNG y SVG para afiches y carnés (`AGENTS.md` A4).                                              |
| `nodemailer`                         | `10.3.1`          | MIT-0      | Envío de correos transaccionales por SMTP detrás del puerto `NotificationChannel` (`EmailChannel`) hacia Mailpit (`AGENTS.md` A4, A6). |
| `exceljs`                            | `4.4.0`           | MIT        | Generación en servidor de reportes descargables en formato Excel (`.xlsx`) con columnas tipadas (`AGENTS.md` A4).                      |
| `csv-stringify`                      | `6.9.0`           | MIT        | Serialización RFC 4180 de reportes descargables en formato CSV (`AGENTS.md` A4).                                                       |
| `zod`                                | `4.6.7`           | MIT        | Validación de configuración de entorno al arranque y esquemas HTTP.                                                                    |
| `drizzle-kit` _(dev)_                | `0.31.11`         | MIT        | Generador de migraciones SQL versionadas a partir de los esquemas de cada módulo.                                                      |
| `tsx` _(dev)_                        | `4.23.15`         | MIT        | Ejecución con recarga en desarrollo y CLI de migraciones.                                                                              |
| `esbuild` _(dev)_                    | `0.28.2`          | MIT        | Empaquetado rápido del servidor en un único artefacto ESM para producción y Docker.                                                    |
| `@types/pg` _(dev)_                  | `8.23.1`          | MIT        | Tipos TypeScript para `pg`.                                                                                                            |
| `@types/pdfkit` _(dev)_              | `0.17.7`          | MIT        | Tipos TypeScript para `pdfkit`.                                                                                                        |
| `@types/qrcode` _(dev)_              | `1.5.6`           | MIT        | Tipos TypeScript para `qrcode`.                                                                                                        |
| `@types/nodemailer` _(dev)_          | `8.0.2`           | MIT        | Tipos TypeScript para `nodemailer`.                                                                                                    |
| `pino-pretty` _(dev)_                | `13.2.0`          | MIT        | Formateo legible de logs en desarrollo local.                                                                                          |
| `@testcontainers/postgresql` _(dev)_ | `12.2.1`          | MIT        | Contenedores efímeros de PostgreSQL real para pruebas de integración (`AGENTS.md` A8).                                                 |

## `apps/web`

| Paquete                                     | Versión instalada  | Licencia | Qué resuelve y por qué se eligió                                                                                       |
| ------------------------------------------- | ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `react` / `react-dom`                       | `19.3.1`           | MIT      | Biblioteca de interfaz de usuario del frontend (`AGENTS.md` A4).                                                       |
| `react-router`                              | `8.5.1`            | MIT      | Enrutamiento cliente para vistas públicas (`/c/:code`, `/p/:code`, `/v/:code`) y panel del funcionario.                |
| `@tanstack/react-query`                     | `5.105.3`          | MIT      | Caché y sincronización de estado del servidor en el panel (`AGENTS.md` A4).                                            |
| `react-hook-form` / `@hookform/resolvers`   | `7.91.0` / `7.0.2` | MIT      | Formularios controlados validados con esquemas Zod compartidos (`AGENTS.md` A4).                                       |
| `qrcode` / `@types/qrcode` _(dev)_          | `1.5.4` / `1.5.6`  | MIT      | Generación en cliente del cartel QR imprimible de cada sede (`/p/:loanPointCode`) y de eventos (`AGENTS.md` A4).       |
| `recharts`                                  | `3.10.1`           | MIT      | Biblioteca de gráficos declarativos sobre SVG exigida en `AGENTS.md` A4.                                               |
| `signature_pad`                             | `5.1.4`            | MIT      | Lienzo de firma manuscrita digital en HTML5 Canvas para solicitudes públicas de préstamo (`/p/:code`, `AGENTS.md` A4). |
| `lucide-react`                              | `1.67.0`           | ISC      | Iconografía lineal geométrica para acompañar estados con icono + texto (`AGENTS.md` A9).                               |
| `@fontsource-variable/inter`                | `5.3.0`            | OFL-1.1  | Tipografía principal Inter Variable autoalojada, sin CDN (`AGENTS.md` A9).                                             |
| `@fontsource-variable/jetbrains-mono`       | `5.3.0`            | OFL-1.1  | Tipografía monoespaciada autoalojada para códigos públicos, documentos y certificados (`AGENTS.md` A9).                |
| `vite` / `@vitejs/plugin-react` _(dev)_     | `8.3.5` / `6.2.1`  | MIT      | Servidor de desarrollo con proxy `/api` y empaquetador de producción.                                                  |
| `tailwindcss` / `@tailwindcss/vite` _(dev)_ | `4.3.4`            | MIT      | Motor de estilos conectado al sistema de tokens semánticos (`@theme inline`) de `tokens.css` (`AGENTS.md` A4, A9).     |
| `@types/react` / `@types/react-dom` _(dev)_ | `19.3.0`           | MIT      | Definiciones de tipos para React 19.                                                                                   |
