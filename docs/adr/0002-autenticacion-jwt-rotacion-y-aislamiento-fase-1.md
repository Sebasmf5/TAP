# ADR 0002: Autenticación JWT con rotación, aislamiento multi-tenant y acceso en Fase 1

- **Estado:** Aceptado
- **Fecha:** 2026-11-04

## Contexto

La Fase 1 implementa el acceso de funcionarios y la gestión de entidades (`AGENTS.md` A5.7, A7.1, B3.1). El sistema debe ser multi-tenant desde el primer día, garantizar que ningún token viaje o persista en almacenamiento inseguro del navegador, impedir ataques de suplantación o manipulación de tokens y restringir el acceso federado únicamente a los dominios autorizados de cada entidad.

## Decisiones

1. **Par de tokens y almacenamiento sin `localStorage`:**
   - **Access Token:** Vida corta (15 minutos), firmado con `EdDSA` (Ed25519) mediante `jose`. Lista blanca estricta de algoritmos (rechazo tajante de `none` y firmas simétricas). Los claims (`iss`, `aud`, `sub`, `org`, `role`, `jti`) excluyen estrictamente datos personales (sin correo ni nombre).
   - Vive **únicamente en memoria** del cliente web (`auth-store.ts`) y se envía en cabecera `Authorization: Bearer`.
   - **Refresh Token:** Opaco, de alta entropía (64 caracteres hexadecimales), con vigencia de 7 días. Se transmite en cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. Web y API se sirven bajo el mismo host en desarrollo mediante el proxy `/api` de Vite y en producción bajo el mismo origen.

2. **Rotación estricta y detección de reutilización de tokens de refresco:**
   - En la base de datos (`access.refresh_tokens`) se almacena **únicamente el hash SHA-256** del token, junto con su identificador de familia (`family_id`), fecha de expiración, IP hash y user agent.
   - Cada llamada a `/api/v1/auth/refresh` invalida el token actual y emite uno nuevo en la misma familia.
   - Si se detecta un intento de reutilización de un token ya rotado, se activa la regla de seguridad: **toda la familia de tokens se revoca de inmediato**, cerrando todas las sesiones del usuario atacado.

3. **Caché corta de revocación de usuario (60 segundos):**
   - Para evitar una consulta a base de datos en cada petición HTTP pero garantizar que la deshabilitación o cambio de rol de un funcionario surta efecto casi inmediato, se implementa una caché en memoria de 60 segundos sobre el estado (`isActive`, `role`) del usuario en `AccessService`.

4. **Validación de dominios permitidos en inicio de sesión con Google:**
   - El intercambio del código OAuth de Google se completa 100% en el servidor.
   - Antes de autenticar o crear la sesión del funcionario, se valida que el dominio del correo institucional verificado coincida con `allowedEmailDomains` configurado en la entidad del usuario. Si no coincide o el correo no está verificado, se rechaza la autenticación con error 403 / dominio no autorizado.

5. **Aislamiento multi-tenant por defecto:**
   - Todas las tablas de negocio incluyen `organization_id` indexado. Los repositorios de infraestructura de Drizzle aplican invariablemente el filtro `eq(table.organizationId, tenantContext.organizationId)`.
   - Las pruebas automatizadas verifican que consultas o mutaciones entre entidades distintas resulten en `NotFoundError` o `ForbiddenError` sin revelar la existencia de recursos ajenos.
