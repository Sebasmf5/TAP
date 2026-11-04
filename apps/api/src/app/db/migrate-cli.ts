import { createLogger, loadConfig } from '../../shared/index.ts';
import { createDatabaseConnection } from './connection.ts';
import { runMigrations } from './migrate.ts';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const connection = createDatabaseConnection(config.DATABASE_URL);

try {
  logger.info('Aplicando migraciones de base de datos...');
  await runMigrations(connection.db);
  logger.info('Migraciones aplicadas correctamente.');
} finally {
  await connection.close();
}
