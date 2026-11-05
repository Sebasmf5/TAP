import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createAppContainer } from '../src/app/container.ts';
import type { DatabaseConnection } from '../src/app/db/connection.ts';
import { buildServer } from '../src/app/server.ts';
import { generateEd25519KeyPairBase64 } from '../src/modules/access/index.ts';
import {
  FixedClock,
  InMemoryJobQueue,
  createLogger,
  generatePublicCode,
  loadConfig,
} from '../src/shared/index.ts';

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number((sorted[idx] ?? 0).toFixed(2));
}

async function runLoadBenchmark(): Promise<void> {
  const keys = generateEd25519KeyPairBase64();
  const dbPass = randomBytes(16).toString('hex');
  const adminPassword = `ClaveCarga#${randomBytes(6).toString('hex')}`;

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
  await jobQueue.start();

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

  await container.seedInitialData();
  const org = await container.organizationsModule.getOrganizationBySlug('bienestar-piloto');
  if (!org) {
    throw new Error('No se encontró la entidad semilla.');
  }

  // Pre-cargar 1.500 personas en el directorio
  const TOTAL_UNIQUE_PARTICIPANTS = 1_500;
  const DUPLICATE_BURST_REQUESTS = 300;
  const BURST_CONCURRENCY = 50;

  const now = clock.now();
  for (let i = 1; i <= TOTAL_UNIQUE_PARTICIPANTS; i += 1) {
    await container.peopleModule.repository.create({
      id: container.idGenerator.nextId(),
      organizationId: org.id,
      documentType: 'CC',
      documentNumber: String(1100000000 + i),
      institutionalCode: `2026${String(i).padStart(4, '0')}`,
      fullName: `Estudiante Piloto ${i}`,
      email: `estudiante${i}@uceva.edu.co`,
      phone: null,
      personType: 'student',
      isMinor: false,
      guardianName: null,
      guardianDocument: null,
      guardianPhone: null,
      qrToken: generatePublicCode(12),
      createdAt: now,
      updatedAt: now,
    });
  }

  const app = await buildServer(container);

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email: 'admin@demo.tap',
      password: adminPassword,
    },
  });
  const { accessToken } = loginRes.json<{ accessToken: string }>();

  const createEventRes = await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      name: 'Evento Masivo Prueba de Carga 1500 Check-ins',
      type: 'mass',
      startsAt: '2026-11-04T14:30:00.000Z',
      endsAt: '2026-11-04T19:00:00.000Z',
      allowedIdentificationModes: ['document', 'institutional_code'],
      confirmIdentity: false,
      allowWalkIn: false,
    },
  });
  const createdEvent = createEventRes.json<{ id: string; publicCode: string }>();

  await app.inject({
    method: 'POST',
    url: `/api/v1/events/${createdEvent.id}/publish`,
    headers: { authorization: `Bearer ${accessToken}` },
  });
  await app.inject({
    method: 'POST',
    url: `/api/v1/events/${createdEvent.id}/open`,
    headers: { authorization: `Bearer ${accessToken}` },
  });

  // Ejecutar 1.500 check-ins únicos + 300 reintentos duplicados (1.800 peticiones en ráfagas de 50 concurrentes)
  const allIdentifiers: string[] = [];
  for (let i = 1; i <= TOTAL_UNIQUE_PARTICIPANTS; i += 1) {
    allIdentifiers.push(String(1100000000 + i));
  }
  for (let i = 1; i <= DUPLICATE_BURST_REQUESTS; i += 1) {
    allIdentifiers.push(String(1100000000 + i));
  }

  const durationsMs: number[] = [];
  let registeredResponses = 0;
  let alreadyRegisteredResponses = 0;
  let failedResponses = 0;

  const suiteStart = performance.now();

  for (let offset = 0; offset < allIdentifiers.length; offset += BURST_CONCURRENCY) {
    const batch = allIdentifiers.slice(offset, offset + BURST_CONCURRENCY);
    await Promise.all(
      batch.map(async (doc) => {
        const reqStart = performance.now();
        const res = await app.inject({
          method: 'POST',
          url: `/api/v1/public/checkin/${createdEvent.publicCode}`,
          payload: {
            identificationMode: 'document',
            identifier: doc,
            clientDurationMs: 1950,
          },
        });
        const elapsed = performance.now() - reqStart;
        durationsMs.push(elapsed);

        if (res.statusCode !== 200) {
          failedResponses += 1;
          return;
        }
        const body = res.json<{ outcome: string }>();
        if (body.outcome === 'registered') {
          registeredResponses += 1;
        } else if (body.outcome === 'already_registered') {
          alreadyRegisteredResponses += 1;
        } else {
          failedResponses += 1;
        }
      }),
    );
  }

  const totalElapsedMs = performance.now() - suiteStart;
  const sorted = [...durationsMs].sort((a, b) => a - b);

  const listRes = await app.inject({
    method: 'GET',
    url: `/api/v1/events/${createdEvent.id}/attendance`,
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const listBody = listRes.json<{
    summary: { totalValid: number; uniqueAttendees: number };
  }>();

  await app.close();

  const report = {
    totalRequests: allIdentifiers.length,
    burstConcurrency: BURST_CONCURRENCY,
    totalDurationMs: Number(totalElapsedMs.toFixed(1)),
    effectiveThroughputRps: Number(((allIdentifiers.length / totalElapsedMs) * 1000).toFixed(1)),
    registeredResponses,
    alreadyRegisteredResponses,
    failedResponses,
    persistedValidRecords: listBody.summary.totalValid,
    persistedUniqueAttendees: listBody.summary.uniqueAttendees,
    duplicatesPersisted: listBody.summary.totalValid - listBody.summary.uniqueAttendees,
    lostRecords: TOTAL_UNIQUE_PARTICIPANTS - listBody.summary.totalValid,
    latencyMs: {
      min: percentile(sorted, 1),
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: Number((sorted[sorted.length - 1] ?? 0).toFixed(2)),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (
    report.failedResponses > 0 ||
    report.duplicatesPersisted > 0 ||
    report.lostRecords > 0 ||
    report.latencyMs.p95 >= 300
  ) {
    process.exitCode = 1;
  }
}

void runLoadBenchmark();
