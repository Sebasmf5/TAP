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
  createAttendanceModule,
  type AttendanceModule,
  type AttendanceRepository,
} from '../modules/attendance/index.ts';
import {
  createCertificatesModule,
  type CertificatePdfRenderer,
  type CertificatesModule,
  type CertificatesRepository,
} from '../modules/certificates/index.ts';
import {
  createEventsModule,
  type EventPosterRenderer,
  type EventsModule,
  type EventsRepository,
} from '../modules/events/index.ts';
import {
  createInventoryModule,
  type InventoryModule,
  type InventoryRepository,
} from '../modules/inventory/index.ts';
import {
  createLoansModule,
  type LoansModule,
  type LoansRepository,
} from '../modules/loans/index.ts';
import {
  LogNotificationChannel,
  createNotificationsModule,
  type NotificationChannel,
  type NotificationsModule,
  type NotificationsRepository,
} from '../modules/notifications/index.ts';
import {
  DEFAULT_FEATURE_FLAGS,
  createOrganizationsModule,
  type OrganizationsModule,
  type OrganizationsRepository,
} from '../modules/organizations/index.ts';
import {
  createPeopleModule,
  type PeopleModule,
  type PeopleRepository,
} from '../modules/people/index.ts';
import { createReportsModule, type ReportsModule } from '../modules/reports/index.ts';
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
  readonly peopleModule: PeopleModule;
  readonly eventsModule: EventsModule;
  readonly attendanceModule: AttendanceModule;
  readonly certificatesModule: CertificatesModule;
  readonly notificationsModule: NotificationsModule;
  readonly inventoryModule: InventoryModule;
  readonly loansModule: LoansModule;
  readonly reportsModule: ReportsModule;
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
  fileStorage?: FileStorage;
  auditLog?: AuditLog;
  inMemoryRepositories?: boolean;
  organizationsRepository?: OrganizationsRepository;
  accessRepository?: AccessRepository;
  peopleRepository?: PeopleRepository;
  eventsRepository?: EventsRepository;
  attendanceRepository?: AttendanceRepository;
  certificatesRepository?: CertificatesRepository;
  notificationsRepository?: NotificationsRepository;
  inventoryRepository?: InventoryRepository;
  loansRepository?: LoansRepository;
  posterRenderer?: EventPosterRenderer;
  certificatePdfRenderer?: CertificatePdfRenderer;
  notificationChannel?: NotificationChannel;
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
  const fileStorage = params.fileStorage ?? new LocalDiskFileStorage(params.config.STORAGE_DIR);

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

  const peopleModule = createPeopleModule({
    db: useInMemory ? undefined : database.db,
    repository: params.peopleRepository,
    idGenerator,
    clock,
    auditLog,
  });

  const eventsModule = createEventsModule({
    db: useInMemory ? undefined : database.db,
    repository: params.eventsRepository,
    posterRenderer: params.posterRenderer,
    idGenerator,
    clock,
    eventBus,
    auditLog,
    appUrl: params.config.APP_URL,
    getOrganizationName: async (organizationId) => {
      const org = await organizationsModule.getOrganizationById(organizationId);
      return org?.name ?? null;
    },
  });

  const attendanceModule = createAttendanceModule({
    db: useInMemory ? undefined : database.db,
    repository: params.attendanceRepository,
    idGenerator,
    clock,
    eventBus,
    auditLog,
    findEventByPublicCode: (publicCode) => eventsModule.findByPublicCode(publicCode),
    findEventById: (organizationId, eventId) => eventsModule.findById(organizationId, eventId),
    findOrganizationById: (organizationId) =>
      organizationsModule.service.getByIdInternal(organizationId),
    assertFeatureEnabled: (organizationId, feature) =>
      organizationsModule.requireFeature(organizationId, feature),
    personGateway: {
      findById: (organizationId, personId) => peopleModule.findById(organizationId, personId),
      findByDocument: (organizationId, documentNumber, documentType) =>
        peopleModule.findByDocument(organizationId, documentNumber, documentType),
      findByInstitutionalCode: (organizationId, code) =>
        peopleModule.findByInstitutionalCode(organizationId, code),
      findByQrToken: (organizationId, qrToken) =>
        peopleModule.findByQrToken(organizationId, qrToken),
      registerPublicWalkInPerson: (walkInParams) =>
        peopleModule.registerPublicWalkInPerson(walkInParams),
    },
  });

  // Referencia diferida para la entrega de certificados
  const certificatesModuleHolder: { current?: CertificatesModule } = {};

  const notificationsModule = createNotificationsModule({
    db: useInMemory ? undefined : database.db,
    repository: params.notificationsRepository,
    channel: params.notificationChannel ?? new LogNotificationChannel(params.logger),
    jobQueue,
    eventBus,
    idGenerator,
    clock,
    auditLog,
    onCertificateDelivered: async (organizationId, certificateId, deliveredAt) => {
      if (certificatesModuleHolder.current) {
        await certificatesModuleHolder.current.markCertificateDelivered(
          organizationId,
          certificateId,
          deliveredAt,
        );
      }
    },
  });

  const certificatesModule = createCertificatesModule({
    db: useInMemory ? undefined : database.db,
    repository: params.certificatesRepository,
    pdfRenderer: params.certificatePdfRenderer,
    fileStorage,
    idGenerator,
    clock,
    eventBus,
    auditLog,
    appUrl: params.config.APP_URL,
    findEventById: (organizationId, eventId) => eventsModule.findById(organizationId, eventId),
    findOrganizationById: (organizationId) =>
      organizationsModule.service.getByIdInternal(organizationId),
    assertFeatureEnabled: (organizationId, feature) =>
      organizationsModule.requireFeature(organizationId, feature),
    listValidAttendanceByEvent: (organizationId, eventId) =>
      attendanceModule.listValidByEvent(organizationId, eventId),
    findPersonById: (organizationId, personId) => peopleModule.findById(organizationId, personId),
    enqueueResendNotification: async ({ organizationId, certificate, verificationUrl }) => {
      const recipientEmail = certificate.templateSnapshot.recipientEmail;
      if (!recipientEmail) return;
      await notificationsModule.enqueueNotification({
        organizationId,
        template: 'certificate_issued',
        recipient: recipientEmail,
        variables: {
          holder_name: certificate.templateSnapshot.holderName,
          event_name: certificate.templateSnapshot.eventName,
          hours: certificate.templateSnapshot.hours,
          certificate_code: certificate.code,
          organization_name: certificate.templateSnapshot.organizationName,
          verification_url: verificationUrl,
        },
        relatedEntityType: 'certificate',
        relatedEntityId: certificate.id,
        deduplicationKey: `certificate_resend:${certificate.id}:${clock.now().getTime()}`,
      });
    },
  });

  certificatesModuleHolder.current = certificatesModule;

  const inventoryModule = createInventoryModule({
    db: useInMemory ? undefined : database.db,
    repository: params.inventoryRepository,
    idGenerator,
    clock,
    auditLog,
    findOrganizationById: (organizationId) =>
      organizationsModule.service.getByIdInternal(organizationId),
    assertFeatureEnabled: (organizationId, feature) =>
      organizationsModule.requireFeature(organizationId, feature),
  });

  const loansModule = createLoansModule({
    db: useInMemory ? undefined : database.db,
    repository: params.loansRepository,
    fileStorage,
    idGenerator,
    clock,
    eventBus,
    auditLog,
    findOrganizationById: (organizationId) =>
      organizationsModule.service.getByIdInternal(organizationId),
    assertFeatureEnabled: (organizationId, feature) =>
      organizationsModule.requireFeature(organizationId, feature),
    inventoryGateway: {
      listModelsInternal: (organizationId) => inventoryModule.listModelsInternal(organizationId),
      claimAvailableUnitForLoan: (claimParams) =>
        inventoryModule.claimAvailableUnitForLoan(claimParams),
      releaseUnitFromLoan: (releaseParams) => inventoryModule.releaseUnitFromLoan(releaseParams),
      findUnitByQrOrCode: (organizationId, qrOrCode) =>
        inventoryModule.findUnitByQrOrCode(organizationId, qrOrCode),
      findUnitById: (organizationId, unitId) =>
        inventoryModule.findUnitById(organizationId, unitId),
      findModelById: (organizationId, modelId) =>
        inventoryModule.findModelById(organizationId, modelId),
    },
    personGateway: {
      findById: (organizationId, personId) => peopleModule.findById(organizationId, personId),
      findByDocument: (organizationId, documentType, documentNumber) =>
        peopleModule.findByDocument(organizationId, documentNumber, documentType),
      findByInstitutionalCode: (organizationId, code) =>
        peopleModule.findByInstitutionalCode(organizationId, code),
      registerPublicWalkInPerson: (walkInParams) =>
        peopleModule.registerPublicWalkInPerson(walkInParams),
    },
  });

  const reportsModule = createReportsModule({
    auditLog,
    findOrganizationById: (organizationId) =>
      organizationsModule.service.getByIdInternal(organizationId),
    assertFeatureEnabled: (organizationId, feature) =>
      organizationsModule.requireFeature(organizationId, feature),
    listEvents: (organizationId) => eventsModule.listEventsInternal(organizationId),
    listValidAttendanceByEvent: (organizationId, eventId) =>
      attendanceModule.listValidByEvent(organizationId, eventId),
    listCertificatesByEvent: (organizationId, eventId) =>
      certificatesModule.listEventCertificatesInternal(organizationId, eventId),
    listInventoryModels: (organizationId) => inventoryModule.listModelsInternal(organizationId),
    listInventoryUnits: (organizationId) => inventoryModule.listUnitsInternal(organizationId),
    listLoans: (organizationId) => loansModule.listLoansInternal(organizationId),
    findPersonById: (organizationId, personId) => peopleModule.findById(organizationId, personId),
  });

  async function seedInitialData(): Promise<void> {
    const existingOrg = await organizationsModule.getOrganizationBySlug('bienestar-piloto');
    const now = clock.now();
    const orgId = existingOrg?.id ?? idGenerator.nextId();
    let defaultSiteId = idGenerator.nextId();

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
        id: defaultSiteId,
        organizationId: orgId,
        name: 'Punto Central de Bienestar',
        code: 'BIENESTAR-01',
        loanPointCode: 'PRESTAMO01',
        address: 'Bloque Administrativo — Piso 1',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const existingSites = await organizationsModule.repository.listSitesByOrganization(orgId);
      if (existingSites[0]) {
        defaultSiteId = existingSites[0].id;
      }
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

    // Semilla inicial de inventario y punto de préstamo para demostración (idempotente)
    const existingCategories = await inventoryModule.repository.listCategoriesByOrganization(orgId);
    if (existingCategories.length === 0) {
      const sportsCat = await inventoryModule.repository.createCategory({
        id: idGenerator.nextId(),
        organizationId: orgId,
        name: 'Deportes y Recreación',
        defaultLoanDurationHours: 4,
        maxUnitsPerBorrower: 2,
        createdAt: now,
      });

      const futsalModel = await inventoryModule.repository.createModel({
        id: idGenerator.nextId(),
        organizationId: orgId,
        categoryId: sportsCat.id,
        name: 'Balón de Futsal FIFA',
        codePrefix: 'BAL',
        description: 'Balón oficial de microfútbol y futsal talla 4',
        trackingType: 'trackable',
        loanDurationHours: 4,
        createdAt: now,
      });

      const pingPongModel = await inventoryModule.repository.createModel({
        id: idGenerator.nextId(),
        organizationId: orgId,
        categoryId: sportsCat.id,
        name: 'Raqueta de Tenis de Mesa',
        codePrefix: 'RAQ',
        description: 'Raqueta profesional con caucho aprobado ITTF',
        trackingType: 'trackable',
        loanDurationHours: 2,
        createdAt: now,
      });

      await inventoryModule.repository.insertUnitsBulk([
        {
          id: idGenerator.nextId(),
          organizationId: orgId,
          siteId: defaultSiteId,
          modelId: futsalModel.id,
          code: 'BAL-001',
          qrToken: 'UNIT-BAL001DEMO',
          condition: 'good',
          status: 'available',
          notes: null,
          version: 1,
          createdAt: now,
        },
        {
          id: idGenerator.nextId(),
          organizationId: orgId,
          siteId: defaultSiteId,
          modelId: futsalModel.id,
          code: 'BAL-002',
          qrToken: 'UNIT-BAL002DEMO',
          condition: 'good',
          status: 'available',
          notes: null,
          version: 1,
          createdAt: now,
        },
        {
          id: idGenerator.nextId(),
          organizationId: orgId,
          siteId: defaultSiteId,
          modelId: pingPongModel.id,
          code: 'RAQ-001',
          qrToken: 'UNIT-RAQ001DEMO',
          condition: 'new',
          status: 'available',
          notes: null,
          version: 1,
          createdAt: now,
        },
      ]);

      await loansModule.repository.createLendingPoint({
        id: idGenerator.nextId(),
        organizationId: orgId,
        siteId: defaultSiteId,
        name: 'Punto Central Bienestar — Coliseo',
        publicCode: 'PREST1',
        isOpen: true,
        requireOperatorApproval: false,
        createdAt: now,
      });
    }
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
    peopleModule,
    eventsModule,
    attendanceModule,
    certificatesModule,
    notificationsModule,
    inventoryModule,
    loansModule,
    reportsModule,
    seedInitialData,
    async start(): Promise<void> {
      await jobQueue.start();
      await notificationsModule.registerWorkers();
    },
    async stop(): Promise<void> {
      await jobQueue.stop();
      await database.close();
    },
  };
}
