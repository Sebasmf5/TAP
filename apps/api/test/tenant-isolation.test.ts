import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppContainer } from '../src/app/container.ts';
import type { DatabaseConnection } from '../src/app/db/connection.ts';
import { buildServer } from '../src/app/server.ts';
import { generateEd25519KeyPairBase64 } from '../src/modules/access/index.ts';
import {
  FixedClock,
  ForbiddenError,
  InMemoryJobQueue,
  createLogger,
  loadConfig,
} from '../src/shared/index.ts';

function createTenantTestHarness() {
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

  const clock = new FixedClock('2026-11-04T15:30:00.000Z');
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

  return { container, adminPassword };
}

describe('Aislamiento multi-tenant y FeatureGate (AGENTS.md A5.7, B3.2)', () => {
  it('impide que un usuario de la Entidad A lea o modifique usuarios, sedes o ajustes de la Entidad B', async () => {
    const { container, adminPassword } = createTenantTestHarness();
    await container.seedInitialData();
    const server = await buildServer(container);

    // 1. platform_admin inicia sesión y crea dos entidades independientes (Entidad A y Entidad B)
    const platformLogin = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'plataforma@demo.tap', password: adminPassword },
    });
    expect(platformLogin.statusCode).toBe(200);
    const platformToken: string = platformLogin.json().accessToken;

    const orgARes = await server.inject({
      method: 'POST',
      url: '/api/v1/platform/organizations',
      headers: { authorization: `Bearer ${platformToken}` },
      payload: {
        name: 'Instituto Municipal del Deporte (Entidad A)',
        slug: 'inder-municipal',
        type: 'ente_deportivo',
        plan: 'pilot',
        features: {
          attendance: true,
          certificates: true,
          loans: false,
          inventory: false,
          reports: true,
          kioskMode: true,
          googleSso: false,
        },
        allowedEmailDomains: ['inder.gov.co'],
        retentionDays: 730,
      },
    });
    expect(orgARes.statusCode).toBe(201);
    const orgA = orgARes.json();

    const orgBRes = await server.inject({
      method: 'POST',
      url: '/api/v1/platform/organizations',
      headers: { authorization: `Bearer ${platformToken}` },
      payload: {
        name: 'Caja de Compensación Familiar (Entidad B)',
        slug: 'caja-compensacion',
        type: 'caja',
        plan: 'institutional',
        allowedEmailDomains: ['caja.org.co'],
        retentionDays: 1095,
      },
    });
    expect(orgBRes.statusCode).toBe(201);
    const orgB = orgBRes.json();

    // 2. Sembramos un org_admin para la Entidad A y otro para la Entidad B
    const passA = `AdminEntidadA#${randomBytes(6).toString('hex')}`;
    const passB = `AdminEntidadB#${randomBytes(6).toString('hex')}`;

    const userA = await container.accessModule.service.seedStaffUser({
      organizationId: orgA.id,
      email: 'coord@inder.gov.co',
      fullName: 'Coordinadora Inder (A)',
      password: passA,
      role: 'org_admin',
    });

    const userB = await container.accessModule.service.seedStaffUser({
      organizationId: orgB.id,
      email: 'coord@caja.org.co',
      fullName: 'Coordinador Caja (B)',
      password: passB,
      role: 'org_admin',
    });

    const loginA = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: userA.email, password: passA },
    });
    const tokenA: string = loginA.json().accessToken;

    const loginB = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: userB.email, password: passB },
    });
    const tokenB: string = loginB.json().accessToken;

    // 3. Entidad B crea una sede y un usuario operador
    const siteBRes = await server.inject({
      method: 'POST',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        name: 'Sede Recreacional Norte (B)',
        code: 'NORTE-B1',
        location: 'Av. Principal #45',
      },
    });
    expect(siteBRes.statusCode).toBe(201);
    const siteB = siteBRes.json();
    expect(siteB.loanPointCode).toHaveLength(8);

    const operatorBRes = await server.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        email: 'operador@caja.org.co',
        fullName: 'Operador Caja B',
        role: 'operator',
        password: `ClaveFuerteCajaB#${randomBytes(6).toString('hex')}`,
      },
    });
    expect(operatorBRes.statusCode).toBe(201);
    const operatorB = operatorBRes.json();

    // 4. Usuario de la Entidad A consulta sus usuarios y sedes: jamás ve datos de la Entidad B
    const listUsersA = await server.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listUsersA.statusCode).toBe(200);
    const usersInA: Array<{ id: string; organizationId: string }> = listUsersA.json();
    expect(usersInA.every((u) => u.organizationId === orgA.id)).toBe(true);
    expect(usersInA.some((u) => u.id === operatorB.id || u.id === userB.id)).toBe(false);

    const listSitesA = await server.inject({
      method: 'GET',
      url: '/api/v1/sites',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listSitesA.statusCode).toBe(200);
    expect(listSitesA.json()).toEqual([]);

    // 5. Usuario de la Entidad A intenta modificar o deshabilitar el usuario o la sede de la Entidad B -> 404
    const crossUpdateUser = await server.inject({
      method: 'PATCH',
      url: `/api/v1/users/${operatorB.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { role: 'viewer' },
    });
    expect(crossUpdateUser.statusCode).toBe(404);

    const crossDisableUser = await server.inject({
      method: 'POST',
      url: `/api/v1/users/${operatorB.id}/disable`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(crossDisableUser.statusCode).toBe(404);

    const crossUpdateSite = await server.inject({
      method: 'PATCH',
      url: `/api/v1/sites/${siteB.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'Intento de intrusión desde A' },
    });
    expect(crossUpdateSite.statusCode).toBe(404);

    // 6. Un org_admin no puede acceder a las rutas exclusivas de platform_admin -> 403
    const forbiddenPlatform = await server.inject({
      method: 'GET',
      url: '/api/v1/platform/organizations',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(forbiddenPlatform.statusCode).toBe(403);

    // 7. Restricción de dominios permitidos para alta de usuarios en Entidad A ('inder.gov.co')
    const wrongDomainUser = await server.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        email: 'externo@gmail.com',
        fullName: 'Usuario Externo',
        role: 'operator',
        password: `ClaveFuerteExterna#${randomBytes(6).toString('hex')}`,
      },
    });
    expect(wrongDomainUser.statusCode).toBe(400);
    expect(wrongDomainUser.json().code).toBe('VALIDATION_ERROR');

    // 8. FeatureGate bloquea préstamos en Entidad A (plan básico con loans: false) y lo permite en Entidad B
    await expect(
      container.organizationsModule.requireFeature(orgA.id, 'loans'),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      container.organizationsModule.requireFeature(orgB.id, 'loans'),
    ).resolves.toBeUndefined();

    await server.close();
  });
});
