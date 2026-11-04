import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  CryptoIdGenerator,
  FixedClock,
  ForbiddenError,
  InMemoryAuditLog,
  InMemoryEventBus,
  InMemoryJobQueue,
  LocalDiskFileStorage,
  PUBLIC_CODE_ALPHABET,
  ValidationError,
  assertSameOrganization,
  createPage,
  generatePublicCode,
  generateUuidV7,
  loadConfig,
  maskDocument,
  requireOrganizationId,
} from '../src/shared/index.ts';

function validEnv(): NodeJS.ProcessEnv {
  const dbPass = randomBytes(16).toString('hex');
  const seedPass = randomBytes(16).toString('hex');
  return {
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
  };
}

describe('shared core', () => {
  it('valida la configuración de entorno y falla al arrancar si falta algo o queda un marcador', () => {
    const config = loadConfig(validEnv());
    expect(config.API_PORT).toBe(3000);
    expect(config.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:5173']);

    expect(() =>
      loadConfig({
        ...validEnv(),
        JWT_PRIVATE_KEY: '<generado por pnpm setup:env>',
      }),
    ).toThrow(/JWT_PRIVATE_KEY/);

    expect(() =>
      loadConfig({
        ...validEnv(),
        DATABASE_URL: '',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('mapea AppError a RFC 9457 Problem Details', () => {
    const err = new ValidationError('Revisa los datos.', [
      { path: 'documentNumber', message: 'El documento es obligatorio' },
    ]);
    const problem = err.toProblemDetails('req-123');
    expect(problem).toEqual({
      type: 'https://tap.local/problems/validation-error',
      title: 'Datos de entrada inválidos',
      status: 400,
      detail: 'Revisa los datos.',
      code: 'VALIDATION_ERROR',
      requestId: 'req-123',
      errors: [{ path: 'documentNumber', message: 'El documento es obligatorio' }],
    });

    const conflict = new ConflictError('Ya registrado');
    expect(conflict.toProblemDetails().status).toBe(409);
  });

  it('enmascara documentos dejando solo los últimos 4 caracteres', () => {
    expect(maskDocument('1116254789')).toBe('•••4789');
    expect(maskDocument('123')).toBe('••••');
  });

  it('genera UUID v7 ordenables y códigos públicos sin caracteres ambiguos', () => {
    const id1 = generateUuidV7(1_700_000_000_000);
    const id2 = generateUuidV7(1_700_000_000_500);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id1 < id2).toBe(true);

    const code = generatePublicCode(12);
    expect(code).toHaveLength(12);
    for (const ch of code) {
      expect(PUBLIC_CODE_ALPHABET.includes(ch)).toBe(true);
      expect(['0', 'O', '1', 'I', 'L']).not.toContain(ch);
    }
  });

  it('publica eventos en EventBus y encola trabajos en JobQueue con clave de idempotencia', async () => {
    const bus = new InMemoryEventBus();
    const queue = new InMemoryJobQueue();
    await queue.start();

    const received: string[] = [];
    await queue.registerWorker<{ certId: string }>('certificates.render', async (job) => {
      received.push(job.data.certId);
    });

    bus.subscribe<{ certId: string }>('certificate.issued', async (event) => {
      await queue.enqueue('certificates.render', event.payload, {
        singletonKey: event.payload.certId,
      });
    });

    await bus.publish({
      id: generateUuidV7(),
      name: 'certificate.issued',
      occurredAt: new Date(),
      organizationId: generateUuidV7(),
      payload: { certId: 'cert-1' },
    });

    // Un segundo encolado con la misma singletonKey no duplica el trabajo
    const duplicate = await queue.enqueue(
      'certificates.render',
      { certId: 'cert-1' },
      { singletonKey: 'cert-1' },
    );
    expect(duplicate).toBeNull();
    expect(received).toEqual(['cert-1']);
    await queue.stop();
  });

  it('verifica aislamiento de TenantContext', () => {
    const orgA = generateUuidV7();
    const orgB = generateUuidV7();
    const ctx = { userId: generateUuidV7(), organizationId: orgA, role: 'operator' as const };

    expect(requireOrganizationId(ctx)).toBe(orgA);
    expect(() => assertSameOrganization(ctx, orgA)).not.toThrow();
    expect(() => assertSameOrganization(ctx, orgB)).toThrow(ForbiddenError);
  });

  it('guarda archivos en FileStorage y bloquea path traversal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tap-storage-test-'));
    try {
      const storage = new LocalDiskFileStorage(dir);
      await storage.put('reports/run-1.csv', 'col1;col2\n1;2');
      expect(await storage.exists('reports/run-1.csv')).toBe(true);
      const content = await storage.get('reports/run-1.csv');
      expect(content.toString('utf8')).toBe('col1;col2\n1;2');

      await expect(storage.put('../escape.txt', 'bad')).rejects.toThrow(ForbiddenError);
      await storage.delete('reports/run-1.csv');
      expect(await storage.exists('reports/run-1.csv')).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('registra auditoría y pagina resultados', async () => {
    const clock = new FixedClock('2026-11-04T15:00:00.000Z');
    const idGenerator = new CryptoIdGenerator();
    const audit = new InMemoryAuditLog({ clock, idGenerator });

    const entry = await audit.record({
      organizationId: generateUuidV7(),
      actorUserId: generateUuidV7(),
      action: 'attendance.voided',
      targetType: 'attendance_record',
      targetId: generateUuidV7(),
      metadata: { reason: 'Registro de prueba' },
    });
    expect(entry.occurredAt.toISOString()).toBe('2026-11-04T15:00:00.000Z');

    const page = createPage({
      items: [entry],
      total: 51,
      query: { page: 2, pageSize: 25 },
    });
    expect(page.totalPages).toBe(3);
  });
});
