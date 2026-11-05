import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createAppContainer, type AppContainer } from '../../src/app/container.ts';
import { createDatabaseConnection, type DatabaseConnection } from '../../src/app/db/connection.ts';
import { runMigrations } from '../../src/app/db/migrate.ts';
import {
  generateEd25519KeyPairBase64,
  type GoogleOAuthClient,
} from '../../src/modules/access/index.ts';
import type { EventPosterRenderer } from '../../src/modules/events/index.ts';
import {
  FixedClock,
  InMemoryJobQueue,
  createLogger,
  loadConfig,
  type InMemoryAuditLog,
} from '../../src/shared/index.ts';
import { auditLogsTable } from '../../src/shared/infrastructure/schema.ts';

export type HarnessMode = 'memory' | 'postgres';

export interface TestHarness {
  readonly container: AppContainer;
  readonly clock: FixedClock;
  readonly jobQueue: InMemoryJobQueue;
  readonly keys: ReturnType<typeof generateEd25519KeyPairBase64>;
  readonly adminPassword: string;
  readonly mode: HarnessMode;
  posterRenderCalls(): number;
}

const cleanups: Array<() => Promise<void>> = [];

/** Acciones registradas en el AuditLog, sea en memoria o leyendo `shared.audit_logs` en Postgres. */
export async function listAuditActions(harness: TestHarness): Promise<string[]> {
  if (harness.mode === 'memory') {
    return (harness.container.auditLog as InMemoryAuditLog).entries.map((e) => e.action);
  }
  const rows = await harness.container.database.db
    .select({ action: auditLogsTable.action })
    .from(auditLogsTable);
  return rows.map((r) => r.action);
}

/** Libera contenedores y bases de datos creadas por los harness; llamar en `afterEach`. */
export async function disposeAllHarnesses(): Promise<void> {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) await cleanup();
  }
}

async function createIsolatedDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  const adminUrl = inject('adminDatabaseUrl');
  const databaseName = `tap_test_${randomBytes(6).toString('hex')}`;

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;

  return {
    url: url.toString(),
    drop: async () => {
      const cleaner = new pg.Client({ connectionString: adminUrl });
      await cleaner.connect();
      try {
        await cleaner.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      } finally {
        await cleaner.end();
      }
    },
  };
}

export async function createHarness(
  mode: HarnessMode,
  options: {
    nowIso?: string;
    googleClient?: GoogleOAuthClient;
    posterRenderer?: EventPosterRenderer;
  } = {},
): Promise<TestHarness> {
  const keys = generateEd25519KeyPairBase64();
  const dbPassword = randomBytes(16).toString('hex');
  const adminPassword = `ClaveSegura#${randomBytes(6).toString('hex')}`;

  const config = loadConfig({
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:5173',
    API_HOST: '127.0.0.1',
    API_PORT: '3000',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    LOG_LEVEL: 'silent',
    POSTGRES_USER: 'tap_app',
    POSTGRES_PASSWORD: dbPassword,
    POSTGRES_DB: 'tap',
    DATABASE_URL: `postgres://tap_app:${dbPassword}@127.0.0.1:5432/tap`,
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

  const clock = new FixedClock(options.nowIso ?? '2026-11-04T15:00:00.000Z');
  const jobQueue = new InMemoryJobQueue();
  await jobQueue.start();

  let posterCalls = 0;
  const posterRenderer: EventPosterRenderer = options.posterRenderer ?? {
    async generateQrCodes(checkinUrl) {
      return {
        qrDataUrl: `data:image/png;base64,${Buffer.from(checkinUrl).toString('base64')}`,
        qrSvg: `<svg><text>${checkinUrl}</text></svg>`,
      };
    },
    async renderPosterPdf() {
      posterCalls += 1;
      return Buffer.from('%PDF-1.4 spy');
    },
  };

  let database: DatabaseConnection;
  let dropDatabase: (() => Promise<void>) | null = null;

  if (mode === 'postgres') {
    const isolated = await createIsolatedDatabase();
    dropDatabase = isolated.drop;
    database = createDatabaseConnection(isolated.url);
    await runMigrations(database.db);
  } else {
    database = {
      pool: {} as DatabaseConnection['pool'],
      db: {} as DatabaseConnection['db'],
      async ping() {
        return true;
      },
      async close() {},
    };
  }

  const container = createAppContainer({
    config,
    logger: createLogger('silent'),
    clock,
    jobQueue,
    database,
    inMemoryRepositories: mode === 'memory',
    googleClient: options.googleClient,
    posterRenderer,
  });

  cleanups.push(async () => {
    await container.stop();
    if (dropDatabase) await dropDatabase();
  });

  return {
    container,
    clock,
    jobQueue,
    keys,
    adminPassword,
    mode,
    posterRenderCalls: () => posterCalls,
  };
}
