import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppContainer } from '../src/app/container.ts';
import type { DatabaseConnection } from '../src/app/db/connection.ts';
import { buildServer } from '../src/app/server.ts';
import { FixedClock, InMemoryJobQueue, createLogger, loadConfig } from '../src/shared/index.ts';

function createTestContainer(options?: { dbHealthy?: boolean; queueReady?: boolean }) {
  const dbPass = randomBytes(16).toString('hex');
  const seedPass = randomBytes(16).toString('hex');
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
    JWT_PRIVATE_KEY: randomBytes(32).toString('base64'),
    JWT_PUBLIC_KEY: randomBytes(32).toString('base64'),
    COOKIE_SECURE: 'false',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    SMTP_FROM: 'Tap <no-reply@tap.local>',
    STORAGE_DIR: './storage',
    SEED_ADMIN_EMAIL: 'admin@demo.tap',
    SEED_ADMIN_PASSWORD: seedPass,
  });

  const jobQueue = new InMemoryJobQueue();
  if (options?.queueReady ?? true) {
    void jobQueue.start();
  }

  const fakeDatabase = {
    pool: {} as DatabaseConnection['pool'],
    db: {} as DatabaseConnection['db'],
    async ping() {
      return options?.dbHealthy ?? true;
    },
    async close() {},
  } satisfies DatabaseConnection;

  return createAppContainer({
    config,
    logger: createLogger('silent'),
    clock: new FixedClock('2026-11-04T16:00:00.000Z'),
    jobQueue,
    database: fakeDatabase,
  });
}

describe('API HTTP server (Fase 0)', () => {
  it('responde 200 en GET /health y /api/v1/health con x-request-id y cabeceras Helmet', async () => {
    const container = createTestContainer();
    const server = await buildServer(container);

    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.json()).toEqual({
      status: 'ok',
      service: 'tap-api',
      timestamp: '2026-11-04T16:00:00.000Z',
    });

    const v1Res = await server.inject({ method: 'GET', url: '/api/v1/health' });
    expect(v1Res.statusCode).toBe(200);
    await server.close();
  });

  it('responde 200 en GET /ready cuando DB y JobQueue están arriba y 503 cuando fallan', async () => {
    const healthyServer = await buildServer(
      createTestContainer({ dbHealthy: true, queueReady: true }),
    );
    const okRes = await healthyServer.inject({ method: 'GET', url: '/ready' });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.json().status).toBe('ready');
    await healthyServer.close();

    const degradedServer = await buildServer(
      createTestContainer({ dbHealthy: false, queueReady: true }),
    );
    const failRes = await degradedServer.inject({ method: 'GET', url: '/ready' });
    expect(failRes.statusCode).toBe(503);
    expect(failRes.json()).toEqual({
      status: 'not_ready',
      checks: { database: 'down', jobQueue: 'up' },
      timestamp: '2026-11-04T16:00:00.000Z',
    });
    await degradedServer.close();
  });

  it('devuelve RFC 9457 application/problem+json en rutas no existentes', async () => {
    const server = await buildServer(createTestContainer());
    const res = await server.inject({ method: 'GET', url: '/api/v1/unknown' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json().code).toBe('NOT_FOUND');
    await server.close();
  });
});
