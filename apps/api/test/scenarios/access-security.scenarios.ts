import { UnsecuredJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app/server.ts';
import { JoseJwtTokenService, REFRESH_COOKIE_NAME } from '../../src/modules/access/index.ts';

function extractRefreshCookieValue(setCookieHeader: string | string[] | undefined): string {
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  for (const item of list) {
    if (item.startsWith(`${REFRESH_COOKIE_NAME}=`)) {
      const valuePart = item.split(';')[0] ?? '';
      return valuePart.slice(`${REFRESH_COOKIE_NAME}=`.length);
    }
  }
  return '';
}

import { createHarness, disposeAllHarnesses, type HarnessMode } from '../support/harness.ts';

export function accessSecurityScenarios(mode: HarnessMode): void {
  describe(`Seguridad de autenticación y sesiones (AGENTS.md A7.1) [${mode}]`, () => {
    afterEach(disposeAllHarnesses);

    it('emite par de tokens (JWT EdDSA sin datos personales + cookie HttpOnly SameSite=Strict)', async () => {
      const { container, adminPassword } = await createHarness(mode);
      await container.seedInitialData();
      const server = await buildServer(container);

      const loginRes = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'admin@demo.tap',
          password: adminPassword,
        },
      });

      expect(loginRes.statusCode).toBe(200);
      const body = loginRes.json();
      expect(body.accessToken).toBeTypeOf('string');
      expect(body.expiresInSeconds).toBe(900);
      expect(body.user.email).toBe('admin@demo.tap');
      expect(body.user.role).toBe('org_admin');

      // Verifica que el payload del JWT NO contiene datos personales (ni correo ni nombre)
      const [, payloadB64] = body.accessToken.split('.');
      const decodedPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      expect(decodedPayload.email).toBeUndefined();
      expect(decodedPayload.fullName).toBeUndefined();
      expect(decodedPayload.name).toBeUndefined();
      expect(decodedPayload.iss).toBe('tap-api');
      expect(decodedPayload.aud).toBe('tap-web');
      expect(decodedPayload.role).toBe('org_admin');
      expect(decodedPayload.sub).toBe(body.user.id);
      expect(decodedPayload.jti).toBeTypeOf('string');

      // Verifica atributos de la cookie de refresco
      const rawSetCookie = loginRes.headers['set-cookie'];
      const cookieString = Array.isArray(rawSetCookie)
        ? rawSetCookie.join('; ')
        : String(rawSetCookie);
      expect(cookieString).toContain('HttpOnly');
      expect(cookieString).toContain('SameSite=Strict');
      expect(cookieString).toContain('Path=/api/v1/auth');

      await server.close();
    });

    it('rechaza token manipulado, alg=none, token vencido y aud equivocado', async () => {
      const { container, clock, keys, adminPassword } = await createHarness(mode);
      await container.seedInitialData();
      const server = await buildServer(container);

      const loginRes = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'admin@demo.tap', password: adminPassword },
      });
      const validToken: string = loginRes.json().accessToken;
      const userId: string = loginRes.json().user.id;
      const orgId: string = loginRes.json().user.organizationId;

      // 1. Token manipulado (alterando el payload para escalar a platform_admin sin re-firmar)
      const parts = validToken.split('.');
      const fakePayload = Buffer.from(
        JSON.stringify({
          iss: 'tap-api',
          aud: 'tap-web',
          sub: userId,
          org: orgId,
          role: 'platform_admin',
          iat: Math.floor(clock.now().getTime() / 1000),
          exp: Math.floor(clock.now().getTime() / 1000) + 900,
          jti: '018f0000-0000-7000-8000-000000000099',
        }),
      ).toString('base64url');
      const tamperedToken = `${parts[0]}.${fakePayload}.${parts[2]}`;

      const tamperedRes = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${tamperedToken}` },
      });
      expect(tamperedRes.statusCode).toBe(401);

      // 2. Token con alg=none
      const algNoneToken = new UnsecuredJWT({
        org: orgId,
        role: 'org_admin',
      })
        .setIssuer('tap-api')
        .setAudience('tap-web')
        .setSubject(userId)
        .setJti('018f0000-0000-7000-8000-000000000088')
        .setIssuedAt(Math.floor(clock.now().getTime() / 1000))
        .setExpirationTime(Math.floor(clock.now().getTime() / 1000) + 900)
        .encode();

      const algNoneRes = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${algNoneToken}` },
      });
      expect(algNoneRes.statusCode).toBe(401);

      // 3. Token con audience (aud) equivocado firmado con la misma clave privada
      const wrongAudJwtService = new JoseJwtTokenService({
        privateKeyBase64: keys.privateKeyBase64,
        publicKeyBase64: keys.publicKeyBase64,
        issuer: 'tap-api',
        audience: 'otra-audiencia-distinta',
        accessTtl: '15m',
      });
      const wrongAudSigned = await wrongAudJwtService.signAccessToken({
        userId,
        organizationId: orgId,
        role: 'org_admin',
        jti: '018f0000-0000-7000-8000-000000000077',
        now: clock.now(),
      });

      const wrongAudRes = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${wrongAudSigned.token}` },
      });
      expect(wrongAudRes.statusCode).toBe(401);

      // 4. Token vencido (avanzamos el reloj 16 minutos)
      clock.advanceMs(16 * 60 * 1000);
      const expiredRes = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${validToken}` },
      });
      expect(expiredRes.statusCode).toBe(401);

      await server.close();
    });

    it('rota el refresh token y revoca toda la familia si se reutiliza uno ya rotado', async () => {
      const { container, adminPassword } = await createHarness(mode);
      await container.seedInitialData();
      const server = await buildServer(container);

      const loginRes = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'admin@demo.tap', password: adminPassword },
      });
      const rt1 = extractRefreshCookieValue(loginRes.headers['set-cookie']);
      expect(rt1).toBeTruthy();

      // Primer refresco legítimo con RT1 -> emite RT2
      const refresh1 = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { [REFRESH_COOKIE_NAME]: rt1 },
      });
      expect(refresh1.statusCode).toBe(200);
      const rt2 = extractRefreshCookieValue(refresh1.headers['set-cookie']);
      expect(rt2).toBeTruthy();
      expect(rt2).not.toBe(rt1);

      // Intento de reutilización de RT1 (token ya rotado) -> 401 y revoca toda la familia
      const reuseAttempt = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { [REFRESH_COOKIE_NAME]: rt1 },
      });
      expect(reuseAttempt.statusCode).toBe(401);

      // Ahora incluso RT2 (que era el último emitido de esa familia) debe estar revocado
      const afterFamilyRevoked = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { [REFRESH_COOKIE_NAME]: rt2 },
      });
      expect(afterFamilyRevoked.statusCode).toBe(401);

      await server.close();
    });

    it('rechaza inmediatamente peticiones de un usuario recién deshabilitado', async () => {
      const { container, adminPassword } = await createHarness(mode);
      await container.seedInitialData();
      const server = await buildServer(container);

      const adminLogin = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'admin@demo.tap', password: adminPassword },
      });
      const adminToken: string = adminLogin.json().accessToken;

      const operatorPassword = `OperadorSegura#${randomBytes(6).toString('hex')}`;
      const createOperatorRes = await server.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          email: 'operador1@demo.tap',
          fullName: 'Carlos Operador',
          role: 'operator',
          password: operatorPassword,
        },
      });
      expect(createOperatorRes.statusCode).toBe(201);
      const operatorId: string = createOperatorRes.json().id;

      const operatorLogin = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'operador1@demo.tap', password: operatorPassword },
      });
      const operatorToken: string = operatorLogin.json().accessToken;
      const operatorRt = extractRefreshCookieValue(operatorLogin.headers['set-cookie']);

      // Antes de deshabilitar, /auth/me responde 200
      const meBefore = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${operatorToken}` },
      });
      expect(meBefore.statusCode).toBe(200);

      // El org_admin deshabilita al operador
      const disableRes = await server.inject({
        method: 'POST',
        url: `/api/v1/users/${operatorId}/disable`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(disableRes.statusCode).toBe(200);
      expect(disableRes.json().status).toBe('disabled');

      // El JWT del operador (aunque aún no haya vencido) es rechazado de inmediato (401)
      const meAfter = await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${operatorToken}` },
      });
      expect(meAfter.statusCode).toBe(401);

      // Su refresh token también fue revocado
      const refreshAfter = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { [REFRESH_COOKIE_NAME]: operatorRt },
      });
      expect(refreshAfter.statusCode).toBe(401);

      await server.close();
    });

    it('valida fortaleza de contraseñas y aplica límite de intentos por IP+correo', async () => {
      const { container, adminPassword } = await createHarness(mode);
      await container.seedInitialData();
      const server = await buildServer(container);

      const adminLogin = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'admin@demo.tap', password: adminPassword },
      });
      const adminToken: string = adminLogin.json().accessToken;

      // Rechaza contraseña común de la lista negra aunque tenga >= 12 caracteres
      const commonPwdRes = await server.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          email: 'nuevo@demo.tap',
          fullName: 'Usuario Prueba',
          role: 'viewer',
          password: 'administrador123',
        },
      });
      expect(commonPwdRes.statusCode).toBe(400);
      expect(commonPwdRes.json().code).toBe('VALIDATION_ERROR');

      // Límite de intentos fallidos de inicio de sesión (5 fallos seguidos activan espera creciente -> 429)
      const wrongPassword = `Incorrecta#${randomBytes(6).toString('hex')}`;
      for (let i = 0; i < 5; i += 1) {
        const failRes = await server.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: 'admin@demo.tap', password: wrongPassword },
        });
        expect(failRes.statusCode).toBe(401);
      }

      const rateLimitedRes = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'admin@demo.tap', password: wrongPassword },
      });
      expect(rateLimitedRes.statusCode).toBe(429);
      expect(rateLimitedRes.json().code).toBe('RATE_LIMITED');

      await server.close();
    });

    it('permite registrar entidad adquiriendo asistencia rápida o inventarios de forma excluyente', async () => {
      const { container, clock } = await createHarness(mode, {
        nowIso: '2026-11-10T15:00:00Z', // Martes 10:00 a. m. America/Bogota (dentro de horario Ley 2300)
      });
      const server = await buildServer(container);

      const passAttendance = `Segura#${randomBytes(6).toString('hex')}`;
      const regAttendanceRes = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          organizationName: 'Liga Atlética Piloto',
          organizationType: 'ente_deportivo',
          servicePlan: 'attendance_only',
          adminFullName: 'Laura Gómez',
          adminEmail: `laura.${randomBytes(3).toString('hex')}@liga.tap`,
          adminPassword: passAttendance,
        },
      });
      expect(regAttendanceRes.statusCode).toBe(201);
      const attToken: string = regAttendanceRes.json().accessToken;

      const attOrgRes = await server.inject({
        method: 'GET',
        url: '/api/v1/organization',
        headers: { authorization: `Bearer ${attToken}` },
      });
      expect(attOrgRes.statusCode).toBe(200);
      expect(attOrgRes.json().features.attendance).toBe(true);
      expect(attOrgRes.json().features.certificates).toBe(true);
      expect(attOrgRes.json().features.inventory).toBe(false);
      expect(attOrgRes.json().features.loans).toBe(false);

      // El módulo de inventarios queda bloqueado por FeatureGate
      const blockedInvRes = await server.inject({
        method: 'GET',
        url: '/api/v1/inventory/categories',
        headers: { authorization: `Bearer ${attToken}` },
      });
      expect(blockedInvRes.statusCode).toBe(403);

      const passInventory = `Bodega#${randomBytes(6).toString('hex')}`;
      const regInventoryRes = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          organizationName: 'Gimnasio Central',
          organizationType: 'gimnasio',
          servicePlan: 'inventory_only',
          adminFullName: 'Carlos Ruiz',
          adminEmail: `carlos.${randomBytes(3).toString('hex')}@gimnasio.tap`,
          adminPassword: passInventory,
        },
      });
      expect(regInventoryRes.statusCode).toBe(201);
      const invToken: string = regInventoryRes.json().accessToken;

      const invOrgRes = await server.inject({
        method: 'GET',
        url: '/api/v1/organization',
        headers: { authorization: `Bearer ${invToken}` },
      });
      expect(invOrgRes.statusCode).toBe(200);
      expect(invOrgRes.json().features.inventory).toBe(true);
      expect(invOrgRes.json().features.loans).toBe(true);
      expect(invOrgRes.json().features.attendance).toBe(false);
      expect(invOrgRes.json().features.certificates).toBe(false);
      expect(invOrgRes.json().features.marketing).toBe(false);

      // La opción 1 (attendance_only) no puede enviar campañas publicitarias (FeatureGate)
      const blockedMarketingRes = await server.inject({
        method: 'POST',
        url: '/api/v1/notifications/marketing-campaign',
        headers: { authorization: `Bearer ${attToken}` },
        payload: {
          subject: 'Nuevo torneo universitario',
          message: 'Inscríbete al nuevo torneo abierto este mes.',
        },
      });
      expect(blockedMarketingRes.statusCode).toBe(403);

      // Opción 3: Certificados + Envío de publicidad
      const passMarketing = `Agencia#${randomBytes(6).toString('hex')}`;
      const mktEmail = `sofia.${randomBytes(3).toString('hex')}@agencia.tap`;
      const regMarketingRes = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          organizationName: 'Agencia Eventos Pro',
          organizationType: 'empresa',
          servicePlan: 'certificates_marketing',
          adminFullName: 'Sofía Castro',
          adminEmail: mktEmail,
          adminPassword: passMarketing,
        },
      });
      expect(regMarketingRes.statusCode).toBe(201);
      const mktToken: string = regMarketingRes.json().accessToken;

      const mktOrgRes = await server.inject({
        method: 'GET',
        url: '/api/v1/organization',
        headers: { authorization: `Bearer ${mktToken}` },
      });
      expect(mktOrgRes.statusCode).toBe(200);
      expect(mktOrgRes.json().features.certificates).toBe(true);
      expect(mktOrgRes.json().features.marketing).toBe(true);
      expect(mktOrgRes.json().features.inventory).toBe(false);

      const campaignRes = await server.inject({
        method: 'POST',
        url: '/api/v1/notifications/marketing-campaign',
        headers: { authorization: `Bearer ${mktToken}` },
        payload: {
          subject: 'Nueva convocatoria de talleres 2026',
          message: 'Ya están abiertas las inscripciones para el nuevo ciclo de talleres.',
        },
      });
      expect(campaignRes.statusCode).toBe(200);
      expect(campaignRes.json().recipientsCount).toBe(0);

      // Fuera de horario Ley 2300 (domingo) debe rechazarse con 400 VALIDATION_ERROR
      clock.advanceMs(5 * 86_400_000);
      const sundayLoginRes = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: mktEmail, password: passMarketing },
      });
      const sundayToken: string = sundayLoginRes.json().accessToken;
      const sundayCampaignRes = await server.inject({
        method: 'POST',
        url: '/api/v1/notifications/marketing-campaign',
        headers: { authorization: `Bearer ${sundayToken}` },
        payload: {
          subject: 'Campaña en domingo no permitida',
          message: 'Este envío debe ser bloqueado por la Ley 2300 de 2023.',
        },
      });
      expect(sundayCampaignRes.statusCode).toBe(400);

      await server.close();
    });
  });
}
