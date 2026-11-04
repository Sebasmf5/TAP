import { createAppContainer } from './app/container.ts';
import type { DatabaseConnection } from './app/db/connection.ts';
import { runMigrations } from './app/db/migrate.ts';
import { buildServer } from './app/server.ts';
import { InMemoryJobQueue, createLogger, loadConfig } from './shared/index.ts';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const useInMemory = process.env['TAP_IN_MEMORY'] === 'true';

const container = createAppContainer({
  config,
  logger,
  inMemoryRepositories: useInMemory,
  jobQueue: useInMemory ? new InMemoryJobQueue() : undefined,
  database: useInMemory
    ? ({
        pool: {} as DatabaseConnection['pool'],
        db: {} as DatabaseConnection['db'],
        async ping() {
          return true;
        },
        async close() {},
      } satisfies DatabaseConnection)
    : undefined,
});

if (!useInMemory) {
  await runMigrations(container.database.db);
}
await container.start();

if (config.NODE_ENV !== 'production') {
  await container.seedInitialData();
}

const server = await buildServer(container);

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Cerrando servidor de forma ordenada...');
  await server.close();
  await container.stop();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await server.listen({
  host: config.API_HOST,
  port: config.API_PORT,
});
