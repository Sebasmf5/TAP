import type { Logger } from 'pino';
import {
  CryptoIdGenerator,
  DrizzleAuditLog,
  DrizzleUnitOfWork,
  InMemoryEventBus,
  LocalDiskFileStorage,
  PgBossJobQueue,
  SystemClock,
  type AppConfig,
  type AuditLog,
  type Clock,
  type EventBus,
  type FileStorage,
  type IdGenerator,
  type JobQueue,
  type UnitOfWork,
} from '../shared/index.ts';
import { createDatabaseConnection, type DatabaseConnection } from './db/connection.ts';

export interface AppContainer {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly eventBus: EventBus;
  readonly jobQueue: JobQueue;
  readonly database: DatabaseConnection;
  readonly unitOfWork: UnitOfWork;
  readonly fileStorage: FileStorage;
  readonly auditLog: AuditLog;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createAppContainer(params: {
  config: AppConfig;
  logger: Logger;
  clock?: Clock;
  idGenerator?: IdGenerator;
  eventBus?: EventBus;
  jobQueue?: JobQueue;
  database?: DatabaseConnection;
}): AppContainer {
  const clock = params.clock ?? new SystemClock();
  const idGenerator = params.idGenerator ?? new CryptoIdGenerator();
  const eventBus = params.eventBus ?? new InMemoryEventBus();
  const database = params.database ?? createDatabaseConnection(params.config.DATABASE_URL);
  const jobQueue =
    params.jobQueue ??
    new PgBossJobQueue({
      connectionString: params.config.DATABASE_URL,
      logger: params.logger,
    });
  const unitOfWork = new DrizzleUnitOfWork(database.db, eventBus);
  const fileStorage = new LocalDiskFileStorage(params.config.STORAGE_DIR);
  const auditLog = new DrizzleAuditLog({
    db: database.db,
    idGenerator,
    clock,
  });

  return {
    config: params.config,
    logger: params.logger,
    clock,
    idGenerator,
    eventBus,
    jobQueue,
    database,
    unitOfWork,
    fileStorage,
    auditLog,
    async start(): Promise<void> {
      await jobQueue.start();
    },
    async stop(): Promise<void> {
      await jobQueue.stop();
      await database.close();
    },
  };
}
