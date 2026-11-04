import type { Logger } from 'pino';
import {
  createAccessModule,
  type AccessModule,
  type AccessRepository,
  type GoogleOAuthClient,
  type JwtTokenService,
  type PasswordHasher,
} from '../modules/access/index.ts';
import {
  DEFAULT_FEATURE_FLAGS,
  createOrganizationsModule,
  type OrganizationsModule,
  type OrganizationsRepository,
} from '../modules/organizations/index.ts';
import {
  CryptoIdGenerator,
  DrizzleAuditLog,
  DrizzleUnitOfWork,
  InMemoryAuditLog,
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
  readonly organizationsModule: OrganizationsModule;
  readonly accessModule: AccessModule;
  seedInitialData(): Promise<void>;
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
  auditLog?: AuditLog;
  inMemoryRepositories?: boolean;
  organizationsRepository?: OrganizationsRepository;
  accessRepository?: AccessRepository;
  passwordHasher?: PasswordHasher;
  jwtService?: JwtTokenService;
  googleClient?: GoogleOAuthClient;
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

  const useInMemory = Boolean(params.inMemoryRepositories);
  const auditLog =
    params.auditLog ??
    (useInMemory
      ? new InMemoryAuditLog({ idGenerator, clock })
      : new DrizzleAuditLog({
          db: database.db,
          idGenerator,
          clock,
        }));

  const organizationsModule = createOrganizationsModule({
    db: useInMemory ? undefined : database.db,
    repository: params.organizationsRepository,
    idGenerator,
    clock,
    auditLog,
  });

  const accessModule = createAccessModule({
    config: params.config,
    db: useInMemory ? undefined : database.db,
    repository: params.accessRepository,
    passwordHasher: params.passwordHasher,
    jwtService: params.jwtService,
    googleClient: params.googleClient,
    idGenerator,
    clock,
    auditLog,
    isEmailAllowedForOrg: (organizationId, email) =>
      organizationsModule.isEmailAllowed(organizationId, email),
  });

  async function seedInitialData(): Promise<void> {
    const existingOrg = await organizationsModule.getOrganizationBySlug('bienestar-piloto');
    const now = clock.now();
    const orgId = existingOrg?.id ?? idGenerator.nextId();

    if (!existingOrg) {
      await organizationsModule.repository.create({
        id: orgId,
        name: 'Bienestar Universitario — Sede Piloto',
        slug: 'bienestar-piloto',
        type: 'institucion_educativa',
        plan: 'institutional',
        features: { ...DEFAULT_FEATURE_FLAGS },
        logoUrl: null,
        timezone: 'America/Bogota',
        allowedEmailDomains: [],
        dataConsentVersion: 'v1.0',
        dataConsentText:
          'Autorizo de manera previa, expresa e informada el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 para el registro de asistencia, emisión de certificados y gestión de préstamos de implementos.',
        retentionDays: 1095,
        createdAt: now,
        updatedAt: now,
      });

      await organizationsModule.repository.createSite({
        id: idGenerator.nextId(),
        organizationId: orgId,
        name: 'Punto Central de Bienestar',
        code: 'BIENESTAR-01',
        loanPointCode: 'PRESTAMO01',
        address: 'Bloque Administrativo — Piso 1',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    await accessModule.service.seedStaffUser({
      organizationId: orgId,
      email: params.config.SEED_ADMIN_EMAIL,
      fullName: 'Coordinación Bienestar',
      password: params.config.SEED_ADMIN_PASSWORD,
      role: 'org_admin',
    });

    await accessModule.service.seedStaffUser({
      organizationId: null,
      email: 'plataforma@demo.tap',
      fullName: 'Equipo Plataforma Tap',
      password: params.config.SEED_ADMIN_PASSWORD,
      role: 'platform_admin',
    });
  }

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
    organizationsModule,
    accessModule,
    seedInitialData,
    async start(): Promise<void> {
      await jobQueue.start();
    },
    async stop(): Promise<void> {
      await jobQueue.stop();
      await database.close();
    },
  };
}
