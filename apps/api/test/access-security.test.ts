import { UnsecuredJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppContainer } from '../src/app/container.ts';
import type { DatabaseConnection } from '../src/app/db/connection.ts';
import { buildServer } from '../src/app/server.ts';
import {
  JoseJwtTokenService,
  REFRESH_COOKIE_NAME,
  generateEd25519KeyPairBase64,
} from '../src/modules/access/index.ts';
import { FixedClock, InMemoryJobQueue, createLogger, loadConfig } from '../src/shared/index.ts';

function createSecurityTestHarness() {
  const keys = generateEd25519KeyPairBase64();
  const dbPass = randomBytes(16).toString('hex');
  const adminPassword = `ClaveSegura#${randomBytes(6).toString('hex')}`;

  const config = loadConfig({
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:5173',
    API_HOST: '127.0.0.1',
    API_PORT: '3000',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    LOG_LEVEL: 'silent',
    POSTGRES_USER: 'tap_app',
    POSTGRES_PASSWORD: dbPass,
    POSTGRES_DB: 'tap',
    DATABASE_URL: `postgres://tap_app:${dbPass}@127.0.0.1:5432/tap`,
    JWT_ISSUER: 'tap-api',
    JWT_AUDIENCE: 'tap-web',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL_DAYS: '7',
    JWT_PRIVATE_KEY: keys.privateKeyBase64,
    JWT_PUBLIC_KEY: keys.publicKeyBase64,
    COOKIE_SECURE: 'false',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    SMTP_FROM: 'Tap <no-reply@tap.local>',
    STORAGE_DIR: './storage',
    SEED_ADMIN_EMAIL: 'admin@demo.tap',
    SEED_ADMIN_PASSWORD: adminPassword,
  });

  const clock = new FixedClock('2026-11-04T15:00:00.000Z');
  const jobQueue = new InMemoryJobQueue();
  void jobQueue.start();

  const fakeDatabase = {
    pool: {} as DatabaseConnection['pool'],
    db: {} as DatabaseConnection['db'],
    async ping() {
      return true;
    },
    async close() {},
  } satisfies DatabaseConnection;

  const container = createAppContainer({
    config,
    logger: createLogger('silent'),
    clock,
    jobQueue,
    database: fakeDatabase,
    inMemoryRepositories: true,
  });

  return { container, clock, keys, adminPassword };
}

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

describe('Seguridad de autenticación y sesiones (AGENTS.md A7.1)', () => {
  it('emite par de tokens (JWT EdDSA sin datos personales + cookie HttpOnly SameSite=Strict)', async () => {
    const { container, adminPassword } = createSecurityTestHarness();
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
    const { container, clock, keys, adminPassword } = createSecurityTestHarness();
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
    const { container, adminPassword } = createSecurityTestHarness();
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
    const { container, adminPassword } = createSecurityTestHarness();
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
    const { container, adminPassword } = createSecurityTestHarness();
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
});
