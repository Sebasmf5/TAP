import { createAppContainer } from './app/container.ts';
import { runMigrations } from './app/db/migrate.ts';
import { buildServer } from './app/server.ts';
import { createLogger, loadConfig } from './shared/index.ts';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const container = createAppContainer({ config, logger });

await runMigrations(container.database.db);
await container.start();

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
