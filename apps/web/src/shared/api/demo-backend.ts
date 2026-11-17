import type {
  AttendanceRecordDto,
  AuthTokenResponse,
  CertificateDto,
  CertificateTemplateDto,
  DashboardSummaryResponse,
  EligibilityEvaluationItem,
  EvaluateEventCertificatesResponse,
  EventAttendanceListResponse,
  EventDto,
  EventQrResponse,
  ImportPeopleResponse,
  InventoryCategoryDto,
  InventoryUnitDto,
  IssueEventCertificatesResponse,
  ItemModelDto,
  LendingPointDto,
  ListNotificationsResponse,
  LoanDto,
  NotificationDto,
  OrganizationDto,
  OverdueSweepResponse,
  PersonDto,
  PublicBorrowerLookupResponse,
  PublicCertificateVerificationResponse,
  PublicCheckinEventInfo,
  PublicCheckinLookupResponse,
  PublicCheckinSubmitResponse,
  PublicLendingPointInfo,
  SiteDto,
  UserProfile,
} from '@tap/contracts';
import QRCode from 'qrcode';

const ORG_ID = '018f0000-0000-7000-8000-000000000010';
const SITE_ID = '018f0000-0000-7000-8000-000000000020';
const EVENT_1_ID = '018f0000-0000-7000-8000-000000000101';
const SESSION_1_ID = '018f0000-0000-7000-8000-000000000201';
const EVENT_2_ID = '018f0000-0000-7000-8000-000000000102';
const SESSION_2_ID = '018f0000-0000-7000-8000-000000000202';
const TEMPLATE_1_ID = '018f0000-0000-7000-8000-000000000301';
const PERSON_1_ID = '018f0000-0000-7000-8000-000000000401';
const PERSON_2_ID = '018f0000-0000-7000-8000-000000000402';
const PERSON_3_ID = '018f0000-0000-7000-8000-000000000403';
const CERT_1_ID = '018f0000-0000-7000-8000-000000000501';
const CAT_1_ID = '018f0000-0000-7000-8000-000000000601';
const MODEL_1_ID = '018f0000-0000-7000-8000-000000000701';
const MODEL_2_ID = '018f0000-0000-7000-8000-000000000702';
const UNIT_1_ID = '018f0000-0000-7000-8000-000000000801';
const UNIT_2_ID = '018f0000-0000-7000-8000-000000000802';
const UNIT_3_ID = '018f0000-0000-7000-8000-000000000803';
const POINT_1_ID = '018f0000-0000-7000-8000-000000000901';
const LOAN_1_ID = '018f0000-0000-7000-8000-000000000951';

const configuredApiBaseUrl =
  (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? '/api/v1';
const hasRemoteBackendConfigured = /^https?:\/\//i.test(configuredApiBaseUrl.trim());

export function isStaticPortfolioHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith('.github.io') || host.endsWith('sebasmf.dev');
}

let demoModeActive =
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).get('demo') === '1' ||
    (isStaticPortfolioHost() && !hasRemoteBackendConfigured));

let demoSessionActive = demoModeActive;

export function isDemoModeActive(): boolean {
  return demoModeActive;
}

export function enableDemoMode(autoLogin = true): void {
  demoModeActive = true;
  if (autoLogin) {
    demoSessionActive = true;
  }
}

function nextDemoId(): string {
  return crypto.randomUUID();
}

function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] ?? 'Participante';
  const first = parts[0] ?? '';
  const secondInitial = parts[1]?.[0]?.toUpperCase() ?? '';
  return `${first} ${secondInitial}.`;
}

function maskDocument(doc: string): string {
  const clean = doc.trim();
  if (clean.length <= 4) return `•••${clean}`;
  return `•••${clean.slice(-4)}`;
}

let demoUser: UserProfile = {
  id: '018f0000-0000-7000-8000-000000000001',
  organizationId: ORG_ID,
  email: 'admin@demo.tap',
  fullName: 'Coordinación Bienestar Universitario',
  role: 'org_admin',
  status: 'active',
  createdAt: '2026-11-01T13:00:00.000Z',
};

let demoUsers: UserProfile[] = [
  demoUser,
  {
    id: '018f0000-0000-7000-8000-000000000002',
    organizationId: ORG_ID,
    email: 'operador@demo.tap',
    fullName: 'Operador Punto Deportivo',
    role: 'operator',
    status: 'active',
    createdAt: '2026-11-02T14:00:00.000Z',
  },
];

let demoOrganization: OrganizationDto = {
  id: ORG_ID,
  slug: 'bienestar-piloto',
  name: 'Bienestar Universitario — Sede Piloto',
  type: 'institucion_educativa',
  plan: 'institutional',
  features: {
    attendance: true,
    certificates: true,
    inventory: true,
    loans: true,
    reports: true,
    kioskMode: true,
    googleSso: false,
  },
  logoUrl: null,
  timezone: 'America/Bogota',
  allowedEmailDomains: ['uceva.edu.co', 'demo.tap'],
  dataConsentVersion: 'v1.0',
  dataConsentText:
    'Autorizo de manera previa, expresa e informada el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 para el registro de asistencia, emisión de certificados y gestión de préstamos de implementos.',
  retentionDays: 1095,
  createdAt: '2026-11-01T12:00:00.000Z',
};

let demoSites: SiteDto[] = [
  {
    id: SITE_ID,
    organizationId: ORG_ID,
    name: 'Punto Central de Bienestar',
    code: 'BIENESTAR-01',
    loanPointCode: 'PREST1',
    address: 'Bloque Administrativo — Piso 1',
    isActive: true,
    createdAt: '2026-11-01T12:00:00.000Z',
  },
];

let demoPeople: PersonDto[] = [
  {
    id: PERSON_1_ID,
    organizationId: ORG_ID,
    documentType: 'CC',
    documentNumber: '1116250001',
    maskedDocument: '•••0001',
    institutionalCode: '20261001',
    fullName: 'Juan Camilo Pérez Gómez',
    abbreviatedName: 'Juan C.',
    email: 'juan.perez@uceva.edu.co',
    phone: '3154445566',
    personType: 'student',
    isMinor: false,
    guardianName: null,
    guardianDocument: null,
    guardianPhone: null,
    qrToken: 'QR-JUAN-DEMO-01',
    latestConsentVersion: 'v1.0',
    latestConsentAt: '2026-11-01T14:00:00.000Z',
    createdAt: '2026-11-01T14:00:00.000Z',
  },
  {
    id: PERSON_2_ID,
    organizationId: ORG_ID,
    documentType: 'CC',
    documentNumber: '1116250002',
    maskedDocument: '•••0002',
    institutionalCode: '20261002',
    fullName: 'María Fernanda Gómez Ríos',
    abbreviatedName: 'María F.',
    email: 'maria.gomez@uceva.edu.co',
    phone: '3167778899',
    personType: 'student',
    isMinor: false,
    guardianName: null,
    guardianDocument: null,
    guardianPhone: null,
    qrToken: 'QR-MARIA-DEMO-02',
    latestConsentVersion: 'v1.0',
    latestConsentAt: '2026-11-01T14:05:00.000Z',
    createdAt: '2026-11-01T14:05:00.000Z',
  },
  {
    id: PERSON_3_ID,
    organizationId: ORG_ID,
    documentType: 'CC',
    documentNumber: '1116250003',
    maskedDocument: '•••0003',
    institutionalCode: '20261003',
    fullName: 'Carlos Andrés Morales Lozada',
    abbreviatedName: 'Carlos A.',
    email: 'carlos.morales@uceva.edu.co',
    phone: '3182223344',
    personType: 'teacher',
    isMinor: false,
    guardianName: null,
    guardianDocument: null,
    guardianPhone: null,
    qrToken: 'QR-CARLOS-DEMO-03',
    latestConsentVersion: 'v1.0',
    latestConsentAt: '2026-11-01T14:10:00.000Z',
    createdAt: '2026-11-01T14:10:00.000Z',
  },
];

let demoEvents: EventDto[] = [
  {
    id: EVENT_1_ID,
    organizationId: ORG_ID,
    siteId: SITE_ID,
    publicCode: 'FERIA1',
    name: 'Jornada de Bienestar y Deporte Universitario',
    description:
      'Evento masivo de integración universitaria con actividades deportivas, culturales y salud preventiva.',
    type: 'mass',
    status: 'open',
    startsAt: new Date(Date.now() - 3600_000).toISOString(),
    endsAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    checkinOpensAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    checkinClosesAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    capacity: 500,
    allowedIdentificationModes: ['document', 'institutional_code', 'person_qr'],
    confirmIdentity: true,
    allowWalkIn: true,
    certificateRule: {
      type: 'any_attendance',
      hours: 4,
    },
    autoIssueCertificates: false,
    sessions: [
      {
        id: SESSION_1_ID,
        eventId: EVENT_1_ID,
        sessionNumber: 1,
        title: 'Jornada Principal — Coliseo Cubierto',
        startsAt: new Date(Date.now() - 3600_000).toISOString(),
        endsAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
      },
    ],
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
  },
  {
    id: EVENT_2_ID,
    organizationId: ORG_ID,
    siteId: SITE_ID,
    publicCode: 'SEMIN1',
    name: 'Seminario de Liderazgo y Gerencia de Proyectos',
    description:
      'Ciclo académico con certificación automática de participación verificable por código QR.',
    type: 'course',
    status: 'closed',
    startsAt: '2026-11-03T14:00:00.000Z',
    endsAt: '2026-11-03T18:00:00.000Z',
    checkinOpensAt: '2026-11-03T13:30:00.000Z',
    checkinClosesAt: '2026-11-03T18:30:00.000Z',
    capacity: 150,
    allowedIdentificationModes: ['document', 'institutional_code', 'person_qr'],
    confirmIdentity: true,
    allowWalkIn: true,
    certificateRule: {
      type: 'min_sessions',
      minSessions: 1,
      hours: 8,
    },
    autoIssueCertificates: true,
    sessions: [
      {
        id: SESSION_2_ID,
        eventId: EVENT_2_ID,
        sessionNumber: 1,
        title: 'Sesión Magistral — Auditorio Central',
        startsAt: '2026-11-03T14:00:00.000Z',
        endsAt: '2026-11-03T18:00:00.000Z',
      },
    ],
    createdAt: '2026-11-01T16:00:00.000Z',
    updatedAt: '2026-11-03T18:30:00.000Z',
  },
];

let demoAttendance: AttendanceRecordDto[] = [
  {
    id: '018f0000-0000-7000-8000-000000000311',
    organizationId: ORG_ID,
    eventId: EVENT_1_ID,
    sessionId: SESSION_1_ID,
    sessionNumber: 1,
    sessionLabel: 'Jornada Principal — Coliseo Cubierto',
    personId: PERSON_1_ID,
    personFullName: 'Juan Camilo Pérez Gómez',
    personDocumentType: 'CC',
    personDocumentNumber: '•••0001',
    personInstitutionalCode: '20261001',
    personType: 'student',
    method: 'event_qr',
    registeredBy: null,
    status: 'valid',
    checkedInAt: new Date(Date.now() - 25 * 60_000).toISOString(),
    clientDurationMs: 4200,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  },
  {
    id: '018f0000-0000-7000-8000-000000000312',
    organizationId: ORG_ID,
    eventId: EVENT_1_ID,
    sessionId: SESSION_1_ID,
    sessionNumber: 1,
    sessionLabel: 'Jornada Principal — Coliseo Cubierto',
    personId: PERSON_2_ID,
    personFullName: 'María Fernanda Gómez Ríos',
    personDocumentType: 'CC',
    personDocumentNumber: '•••0002',
    personInstitutionalCode: '20261002',
    personType: 'student',
    method: 'person_qr',
    registeredBy: demoUser.id,
    status: 'valid',
    checkedInAt: new Date(Date.now() - 15 * 60_000).toISOString(),
    clientDurationMs: 1800,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  },
];

let demoCertTemplates: CertificateTemplateDto[] = [
  {
    id: TEMPLATE_1_ID,
    organizationId: ORG_ID,
    title: 'CERTIFICADO DE PARTICIPACIÓN',
    bodyTemplate:
      'Se certifica que {{fullName}}, identificado(a) con documento {{document}}, participó en {{eventName}} con una intensidad de {{hours}} horas.',
    logoUrl: null,
    signers: [
      {
        name: 'Coordinación de Bienestar Universitario',
        role: 'Dirección de Bienestar',
      },
    ],
    orientation: 'landscape',
    version: 1,
    isDefault: true,
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
  },
];

let demoCertificates: CertificateDto[] = [
  {
    id: CERT_1_ID,
    organizationId: ORG_ID,
    eventId: EVENT_1_ID,
    personId: PERSON_1_ID,
    templateId: TEMPLATE_1_ID,
    code: 'TAP-2026-DEMO01',
    status: 'issued',
    holderName: 'Juan Camilo Pérez Gómez',
    maskedDocument: 'CC •••0001',
    recipientEmail: 'juan.perez@uceva.edu.co',
    eventName: 'Jornada de Bienestar y Deporte Universitario',
    eventDate: '5 de noviembre de 2026',
    hours: '4',
    pdfSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    issuedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    deliveredAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    revokedAt: null,
    revokedReason: null,
    verificationCount: 3,
  },
];

let demoCategories: InventoryCategoryDto[] = [
  {
    id: CAT_1_ID,
    organizationId: ORG_ID,
    name: 'Deportes y Recreación',
    defaultLoanDurationHours: 4,
    maxUnitsPerBorrower: 2,
    createdAt: '2026-11-01T12:00:00.000Z',
  },
];

let demoModels: ItemModelDto[] = [
  {
    id: MODEL_1_ID,
    organizationId: ORG_ID,
    categoryId: CAT_1_ID,
    categoryName: 'Deportes y Recreación',
    name: 'Balón de Futsal FIFA',
    codePrefix: 'BAL',
    description: 'Balón oficial de futsal cámara de butilo',
    trackingType: 'trackable',
    loanDurationHours: 4,
    totalUnitsCount: 2,
    availableUnitsCount: 1,
    loanedUnitsCount: 1,
    createdAt: '2026-11-01T12:00:00.000Z',
  },
  {
    id: MODEL_2_ID,
    organizationId: ORG_ID,
    categoryId: CAT_1_ID,
    categoryName: 'Deportes y Recreación',
    name: 'Raqueta de Tenis de Mesa',
    codePrefix: 'RAQ',
    description: 'Raqueta profesional caucho aprobado ITTF',
    trackingType: 'trackable',
    loanDurationHours: 4,
    totalUnitsCount: 1,
    availableUnitsCount: 1,
    loanedUnitsCount: 0,
    createdAt: '2026-11-01T12:00:00.000Z',
  },
];

let demoUnits: InventoryUnitDto[] = [
  {
    id: UNIT_1_ID,
    organizationId: ORG_ID,
    modelId: MODEL_1_ID,
    modelName: 'Balón de Futsal FIFA',
    categoryName: 'Deportes y Recreación',
    siteId: SITE_ID,
    code: 'BAL-001',
    qrToken: 'UNIT-BAL-001',
    condition: 'good',
    status: 'loaned',
    notes: null,
    createdAt: '2026-11-01T12:00:00.000Z',
  },
  {
    id: UNIT_2_ID,
    organizationId: ORG_ID,
    modelId: MODEL_1_ID,
    modelName: 'Balón de Futsal FIFA',
    categoryName: 'Deportes y Recreación',
    siteId: SITE_ID,
    code: 'BAL-002',
    qrToken: 'UNIT-BAL-002',
    condition: 'new',
    status: 'available',
    notes: null,
    createdAt: '2026-11-01T12:00:00.000Z',
  },
  {
    id: UNIT_3_ID,
    organizationId: ORG_ID,
    modelId: MODEL_2_ID,
    modelName: 'Raqueta de Tenis de Mesa',
    categoryName: 'Deportes y Recreación',
    siteId: SITE_ID,
    code: 'RAQ-001',
    qrToken: 'UNIT-RAQ-001',
    condition: 'new',
    status: 'available',
    notes: null,
    createdAt: '2026-11-01T12:00:00.000Z',
  },
];

let demoLendingPoints: LendingPointDto[] = [
  {
    id: POINT_1_ID,
    organizationId: ORG_ID,
    siteId: SITE_ID,
    name: 'Ventanilla de Implementos Deportivos',
    publicCode: 'PREST1',
    isOpen: true,
    requireOperatorApproval: false,
    createdAt: '2026-11-01T12:00:00.000Z',
  },
];

let demoLoans: LoanDto[] = [
  {
    id: LOAN_1_ID,
    organizationId: ORG_ID,
    siteId: SITE_ID,
    lendingPointId: POINT_1_ID,
    lendingPointName: 'Ventanilla de Implementos Deportivos',
    unitId: UNIT_1_ID,
    unitCode: 'BAL-001',
    unitQrToken: 'UNIT-BAL-001',
    modelId: MODEL_1_ID,
    modelName: 'Balón de Futsal FIFA',
    personId: PERSON_2_ID,
    borrowerName: 'María Fernanda Gómez Ríos',
    maskedDocument: 'CC •••0002',
    borrowerEmail: 'maria.gomez@uceva.edu.co',
    status: 'active',
    conditionOut: 'good',
    conditionIn: null,
    signatureSha256: 'a4e624d686e03ed2767c0abd85c14426b0b1157d2ce81d27bb4fe4f6f01d688a',
    deliveredAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    dueAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    returnedAt: null,
    returnNotes: null,
    createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
  },
];

let demoNotifications: NotificationDto[] = [
  {
    id: '018f0000-0000-7000-8000-000000000991',
    organizationId: ORG_ID,
    channel: 'email',
    template: 'certificate_issued',
    recipient: 'juan.perez@uceva.edu.co',
    subject:
      'Tu certificado de participación: Jornada de Bienestar y Deporte Universitario — Bienestar Universitario',
    status: 'sent',
    attempts: 1,
    lastError: null,
    relatedEntityType: 'certificate',
    relatedEntityId: CERT_1_ID,
    deduplicationKey: 'demo-cert-1',
    sentAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  },
  {
    id: '018f0000-0000-7000-8000-000000000992',
    organizationId: ORG_ID,
    channel: 'email',
    template: 'loan_delivered',
    recipient: 'maria.gomez@uceva.edu.co',
    subject: 'Comprobante de préstamo de implemento BAL-001 — Bienestar Universitario',
    status: 'sent',
    attempts: 1,
    lastError: null,
    relatedEntityType: 'loan',
    relatedEntityId: LOAN_1_ID,
    deduplicationKey: 'demo-loan-1',
    sentAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
  },
];

function syncModelCounts(): void {
  demoModels = demoModels.map((m) => {
    const units = demoUnits.filter((u) => u.modelId === m.id);
    return {
      ...m,
      totalUnitsCount: units.length,
      availableUnitsCount: units.filter((u) => u.status === 'available').length,
      loanedUnitsCount: units.filter((u) => u.status === 'loaned').length,
    };
  });
}

export async function handleDemoRequest<T>(
  normalizedPath: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const [rawPathname = '', rawSearch = ''] = normalizedPath.split('?');
  const pathname = rawPathname;
  const searchParams = new URLSearchParams(rawSearch);
  const upperMethod = method.toUpperCase();
  const payload = (body ?? {}) as Record<string, unknown>;

  // 1. Autenticación
  if (pathname === '/auth/register' && upperMethod === 'POST') {
    const servicePlan =
      payload['servicePlan'] === 'inventory_only' ? 'inventory_only' : 'attendance_only';
    const orgName =
      String(payload['organizationName'] ?? 'Nueva Entidad').trim() || 'Nueva Entidad';
    const orgType =
      (payload['organizationType'] as OrganizationDto['type']) ?? 'institucion_educativa';
    const adminName = String(payload['adminFullName'] ?? 'Administrador').trim() || 'Administrador';
    const adminEmail = String(payload['adminEmail'] ?? 'admin@entidad.tap')
      .trim()
      .toLowerCase();

    demoOrganization = {
      ...demoOrganization,
      name: orgName,
      slug:
        orgName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'nueva-entidad',
      type: orgType,
      plan: 'pilot',
      features:
        servicePlan === 'attendance_only'
          ? {
              attendance: true,
              certificates: true,
              inventory: false,
              loans: false,
              reports: true,
              kioskMode: true,
              googleSso: false,
            }
          : {
              attendance: false,
              certificates: false,
              inventory: true,
              loans: true,
              reports: true,
              kioskMode: false,
              googleSso: false,
            },
    };
    demoUser = {
      id: nextDemoId(),
      organizationId: ORG_ID,
      email: adminEmail,
      fullName: adminName,
      role: 'org_admin',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    demoUsers = [demoUser];
    demoSessionActive = true;
    const response: AuthTokenResponse = {
      accessToken: 'demo-session-active',
      expiresInSeconds: 900,
      user: demoUser,
    };
    return response as unknown as T;
  }

  if (pathname === '/auth/login' && upperMethod === 'POST') {
    demoSessionActive = true;
    const response: AuthTokenResponse = {
      accessToken: 'demo-session-active',
      expiresInSeconds: 900,
      user: demoUser,
    };
    return response as unknown as T;
  }

  if (pathname === '/auth/refresh' && upperMethod === 'POST') {
    if (!demoSessionActive) {
      throw new Error('UNAUTH');
    }
    const response: AuthTokenResponse = {
      accessToken: 'demo-session-active',
      expiresInSeconds: 900,
      user: demoUser,
    };
    return response as unknown as T;
  }

  if (pathname === '/auth/logout' && upperMethod === 'POST') {
    demoSessionActive = false;
    return undefined as unknown as T;
  }

  if (pathname === '/auth/me' && upperMethod === 'GET') {
    return demoUser as unknown as T;
  }

  // 2. Usuarios y organización
  if (pathname === '/users' && upperMethod === 'GET') {
    return demoUsers as unknown as T;
  }

  if (pathname === '/users' && upperMethod === 'POST') {
    const created: UserProfile = {
      id: nextDemoId(),
      organizationId: ORG_ID,
      email: String(payload['email'] ?? 'nuevo@demo.tap'),
      fullName: String(payload['fullName'] ?? 'Funcionario'),
      role: (payload['role'] as UserProfile['role']) ?? 'operator',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    demoUsers = [created, ...demoUsers];
    return created as unknown as T;
  }

  if (pathname === '/organization' && upperMethod === 'GET') {
    return demoOrganization as unknown as T;
  }

  if (pathname === '/organization' && upperMethod === 'PATCH') {
    demoOrganization = {
      ...demoOrganization,
      ...(payload as Partial<OrganizationDto>),
    };
    return demoOrganization as unknown as T;
  }

  if (pathname === '/sites' && upperMethod === 'GET') {
    return demoSites as unknown as T;
  }

  if (pathname === '/sites' && upperMethod === 'POST') {
    const created: SiteDto = {
      id: nextDemoId(),
      organizationId: ORG_ID,
      name: String(payload['name'] ?? 'Nueva Sede'),
      code: String(payload['code'] ?? 'SEDE-02'),
      loanPointCode: 'PREST2',
      address: String(payload['address'] ?? 'Campus Universitario'),
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    demoSites = [...demoSites, created];
    return created as unknown as T;
  }

  if (pathname === '/platform/organizations' && upperMethod === 'GET') {
    return [demoOrganization] as unknown as T;
  }

  // 3. Participantes (/people)
  if (pathname === '/people' && upperMethod === 'GET') {
    const q = (searchParams.get('q') ?? '').trim().toLowerCase();
    if (!q) return demoPeople as unknown as T;
    return demoPeople.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.documentNumber.toLowerCase().includes(q) ||
        (p.institutionalCode ?? '').toLowerCase().includes(q),
    ) as unknown as T;
  }

  if (pathname === '/people' && upperMethod === 'POST') {
    const docNum = String(payload['documentNumber'] ?? '1116999000');
    const fullName = String(payload['fullName'] ?? 'Participante Nuevo');
    const created: PersonDto = {
      id: nextDemoId(),
      organizationId: ORG_ID,
      documentType: (payload['documentType'] as PersonDto['documentType']) ?? 'CC',
      documentNumber: docNum,
      maskedDocument: maskDocument(docNum),
      institutionalCode: (payload['institutionalCode'] as string | null) ?? null,
      fullName,
      abbreviatedName: abbreviateName(fullName),
      email: (payload['email'] as string | null) ?? null,
      phone: (payload['phone'] as string | null) ?? null,
      personType: (payload['personType'] as PersonDto['personType']) ?? 'student',
      isMinor: Boolean(payload['isMinor']),
      guardianName: (payload['guardianName'] as string | null) ?? null,
      guardianDocument: (payload['guardianDocument'] as string | null) ?? null,
      guardianPhone: (payload['guardianPhone'] as string | null) ?? null,
      qrToken: `QR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      latestConsentVersion: 'v1.0',
      latestConsentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    demoPeople = [created, ...demoPeople];
    return created as unknown as T;
  }

  const rotateQrMatch = /^\/people\/([^/]+)\/rotate-qr$/.exec(pathname);
  if (rotateQrMatch && upperMethod === 'POST') {
    const personId = rotateQrMatch[1] ?? '';
    let updatedPerson: PersonDto | undefined;
    demoPeople = demoPeople.map((p) => {
      if (p.id !== personId) return p;
      updatedPerson = {
        ...p,
        qrToken: `QR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      };
      return updatedPerson;
    });
    return (updatedPerson ?? demoPeople[0]) as unknown as T;
  }

  if (pathname === '/people/import' && upperMethod === 'POST') {
    const dryRun = Boolean(payload['dryRun']);
    const csvContent = String(payload['csvContent'] ?? '');
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const dataLines = lines.slice(1);
    const preview: ImportPeopleResponse['preview'] = [];
    for (let idx = 0; idx < dataLines.length; idx++) {
      const line = dataLines[idx] ?? '';
      const cols = line.split(/[;,]/);
      const docType = (cols[0]?.trim() || 'CC') as PersonDto['documentType'];
      const docNumber = cols[1]?.trim() || `1116000${idx}`;
      const code = cols[2]?.trim() || null;
      const name = cols[3]?.trim() || 'Estudiante Importado';
      const email = cols[4]?.trim() || null;
      const existing = demoPeople.some((p) => p.documentNumber === docNumber);
      preview.push({
        rowNumber: idx + 2,
        action: existing ? 'update' : 'create',
        documentType: docType,
        documentNumber: docNumber,
        institutionalCode: code,
        fullName: name,
        email,
        personType: 'student',
        isMinor: false,
      });
      if (!dryRun && !existing) {
        demoPeople.push({
          id: nextDemoId(),
          organizationId: ORG_ID,
          documentType: docType,
          documentNumber: docNumber,
          maskedDocument: maskDocument(docNumber),
          institutionalCode: code,
          fullName: name,
          abbreviatedName: abbreviateName(name),
          email,
          phone: cols[5]?.trim() || null,
          personType: 'student',
          isMinor: false,
          guardianName: null,
          guardianDocument: null,
          guardianPhone: null,
          qrToken: `QR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
          latestConsentVersion: 'v1.0',
          latestConsentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      }
    }
    const res: ImportPeopleResponse = {
      dryRun,
      totalRows: dataLines.length,
      validRowsCount: dataLines.length,
      createdCount: preview.filter((r) => r.action === 'create').length,
      updatedCount: preview.filter((r) => r.action === 'update').length,
      errors: [],
      preview,
    };
    return res as unknown as T;
  }

  // 4. Eventos (/events)
  if (pathname === '/events' && upperMethod === 'GET') {
    return demoEvents as unknown as T;
  }

  if (pathname === '/events' && upperMethod === 'POST') {
    const eventId = nextDemoId();
    const sessionId = nextDemoId();
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const startsAt = String(payload['startsAt'] ?? new Date().toISOString());
    const endsAt = String(payload['endsAt'] ?? new Date(Date.now() + 4 * 3600_000).toISOString());
    const created: EventDto = {
      id: eventId,
      organizationId: ORG_ID,
      siteId: SITE_ID,
      publicCode: code,
      name: String(payload['name'] ?? 'Nuevo Evento Universitario'),
      description: String(payload['description'] ?? 'Evento creado en modo demostración.'),
      type: (payload['type'] as EventDto['type']) ?? 'mass',
      status: 'open',
      startsAt,
      endsAt,
      checkinOpensAt: new Date(Date.now() - 1800_000).toISOString(),
      checkinClosesAt: endsAt,
      capacity: typeof payload['capacity'] === 'number' ? payload['capacity'] : 300,
      allowedIdentificationModes: ['document', 'institutional_code', 'person_qr'],
      confirmIdentity: true,
      allowWalkIn: true,
      certificateRule: (payload['certificateRule'] as EventDto['certificateRule']) ?? {
        type: 'any_attendance',
        hours: 4,
      },
      autoIssueCertificates: false,
      sessions: [
        {
          id: sessionId,
          eventId,
          sessionNumber: 1,
          title: 'Sesión Principal',
          startsAt,
          endsAt,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    demoEvents = [created, ...demoEvents];
    return created as unknown as T;
  }

  const eventActionMatch = /^\/events\/([^/]+)\/(publish|open|close|cancel|duplicate|qr)$/.exec(
    pathname,
  );
  if (eventActionMatch) {
    const eventId = eventActionMatch[1] ?? '';
    const action = eventActionMatch[2] ?? '';
    const ev = demoEvents.find((e) => e.id === eventId) ?? demoEvents[0]!;
    if (action === 'qr') {
      const publicUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/c/${ev.publicCode}`;
      const qrSvg = await QRCode.toString(publicUrl, { type: 'svg', margin: 1 });
      const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 280, margin: 2 });
      const qrRes: EventQrResponse = {
        eventId: ev.id,
        publicCode: ev.publicCode,
        checkinUrl: publicUrl,
        qrDataUrl,
        qrSvg,
      };
      return qrRes as unknown as T;
    }
    if (action === 'duplicate') {
      const copyId = nextDemoId();
      const copy: EventDto = {
        ...ev,
        id: copyId,
        name: `${ev.name} (Copia)`,
        publicCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      demoEvents = [copy, ...demoEvents];
      return copy as unknown as T;
    }
    const statusMap: Record<string, EventDto['status']> = {
      publish: 'scheduled',
      open: 'open',
      close: 'closed',
      cancel: 'cancelled',
    };
    const nextStatus = statusMap[action] ?? ev.status;
    demoEvents = demoEvents.map((item) =>
      item.id === ev.id ? { ...item, status: nextStatus } : item,
    );
    return demoEvents.find((item) => item.id === ev.id) as unknown as T;
  }

  const singleEventMatch = /^\/events\/([^/]+)$/.exec(pathname);
  if (singleEventMatch && upperMethod === 'GET') {
    const ev = demoEvents.find((e) => e.id === singleEventMatch[1]) ?? demoEvents[0];
    return ev as unknown as T;
  }

  // 5. Asistencia pública y en vivo
  const publicCheckinInfoMatch = /^\/public\/checkin\/([^/]+)$/.exec(pathname);
  if (publicCheckinInfoMatch && upperMethod === 'GET') {
    const code = (publicCheckinInfoMatch[1] ?? '').toUpperCase();
    const ev = demoEvents.find((e) => e.publicCode.toUpperCase() === code) ?? demoEvents[0]!;
    const activeSession = ev.sessions[0]!;
    const info: PublicCheckinEventInfo = {
      event: {
        id: ev.id,
        name: ev.name,
        description: ev.description,
        eventType: ev.type,
        status: ev.status,
        location: 'Punto Central de Bienestar',
        startsAt: ev.startsAt,
        endsAt: ev.endsAt,
        checkinOpensAt: ev.checkinOpensAt,
        checkinClosesAt: ev.checkinClosesAt,
        publicCode: ev.publicCode,
        allowedIdentificationModes: ev.allowedIdentificationModes,
        confirmIdentity: ev.confirmIdentity,
        allowWalkIn: ev.allowWalkIn,
        activeSession: {
          id: activeSession.id,
          sessionNumber: activeSession.sessionNumber,
          label: activeSession.title,
        },
        sessions: ev.sessions,
      },
      organization: {
        id: demoOrganization.id,
        name: demoOrganization.name,
        slug: demoOrganization.slug,
        logoUrl: demoOrganization.logoUrl,
        dataConsentVersion: demoOrganization.dataConsentVersion,
        dataConsentText: demoOrganization.dataConsentText,
      },
    };
    return info as unknown as T;
  }

  const publicCheckinLookupMatch = /^\/public\/checkin\/([^/]+)\/lookup$/.exec(pathname);
  if (publicCheckinLookupMatch && upperMethod === 'POST') {
    const identifier = String(payload['identifier'] ?? '').trim();
    const found = demoPeople.find(
      (p) => p.documentNumber === identifier || p.institutionalCode === identifier,
    );
    const res: PublicCheckinLookupResponse = found
      ? {
          found: true,
          maskedName: found.abbreviatedName,
          maskedDocument: `${found.documentType} ${found.maskedDocument}`,
          allowWalkIn: true,
        }
      : {
          found: false,
          maskedName: null,
          maskedDocument: null,
          allowWalkIn: true,
        };
    return res as unknown as T;
  }

  if (publicCheckinInfoMatch && upperMethod === 'POST') {
    const code = (publicCheckinInfoMatch[1] ?? '').toUpperCase();
    const ev = demoEvents.find((e) => e.publicCode.toUpperCase() === code) ?? demoEvents[0]!;
    const identifier = String(payload['identifier'] ?? '').trim();
    let person = demoPeople.find(
      (p) => p.documentNumber === identifier || p.institutionalCode === identifier,
    );
    if (!person) {
      const walkIn = payload['walkInRegistration'] as Record<string, unknown> | undefined;
      if (!walkIn) {
        const needsReg: PublicCheckinSubmitResponse = {
          outcome: 'needs_registration',
          attendanceId: null,
          checkedInAt: null,
          maskedName: null,
          maskedDocument: null,
          sessionNumber: null,
          sessionLabel: null,
          message: 'Completa tus datos básicos y acepta la autorización Ley 1581 para continuar.',
        };
        return needsReg as unknown as T;
      }
      const fullName = String(walkIn['fullName'] ?? 'Participante Visitante');
      const docNum = String(walkIn['documentNumber'] ?? (identifier || '1116000999'));
      person = {
        id: nextDemoId(),
        organizationId: ORG_ID,
        documentType: (walkIn['documentType'] as PersonDto['documentType']) ?? 'CC',
        documentNumber: docNum,
        maskedDocument: maskDocument(docNum),
        institutionalCode: (walkIn['institutionalCode'] as string | null) ?? null,
        fullName,
        abbreviatedName: abbreviateName(fullName),
        email: (walkIn['email'] as string | null) ?? null,
        phone: (walkIn['phone'] as string | null) ?? null,
        personType: (walkIn['personType'] as PersonDto['personType']) ?? 'student',
        isMinor: Boolean(walkIn['isMinor']),
        guardianName: (walkIn['guardianName'] as string | null) ?? null,
        guardianDocument: (walkIn['guardianDocument'] as string | null) ?? null,
        guardianPhone: (walkIn['guardianPhone'] as string | null) ?? null,
        qrToken: `QR-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
        latestConsentVersion: 'v1.0',
        latestConsentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      demoPeople = [person, ...demoPeople];
    }

    const activeSession = ev.sessions[0]!;
    const existing = demoAttendance.find(
      (a) => a.eventId === ev.id && a.personId === person!.id && a.status === 'valid',
    );
    if (existing) {
      const dupRes: PublicCheckinSubmitResponse = {
        outcome: 'already_registered',
        attendanceId: existing.id,
        checkedInAt: existing.checkedInAt,
        maskedName: person.abbreviatedName,
        maskedDocument: `${person.documentType} ${person.maskedDocument}`,
        sessionNumber: activeSession.sessionNumber,
        sessionLabel: activeSession.title,
        message: `Ya habías registrado tu asistencia (${person.abbreviatedName}).`,
      };
      return dupRes as unknown as T;
    }

    const record: AttendanceRecordDto = {
      id: nextDemoId(),
      organizationId: ORG_ID,
      eventId: ev.id,
      sessionId: activeSession.id,
      sessionNumber: activeSession.sessionNumber,
      sessionLabel: activeSession.title,
      personId: person.id,
      personFullName: person.fullName,
      personDocumentType: person.documentType,
      personDocumentNumber: person.maskedDocument,
      personInstitutionalCode: person.institutionalCode,
      personType: person.personType,
      method: 'event_qr',
      registeredBy: null,
      status: 'valid',
      checkedInAt: new Date().toISOString(),
      clientDurationMs: 3200,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
    };
    demoAttendance = [record, ...demoAttendance];

    const submitRes: PublicCheckinSubmitResponse = {
      outcome: 'registered',
      attendanceId: record.id,
      checkedInAt: record.checkedInAt,
      maskedName: person.abbreviatedName,
      maskedDocument: `${person.documentType} ${person.maskedDocument}`,
      sessionNumber: activeSession.sessionNumber,
      sessionLabel: activeSession.title,
      message: `¡Asistencia confirmada para ${person.abbreviatedName}!`,
    };
    return submitRes as unknown as T;
  }

  const eventAttendanceMatch = /^\/events\/([^/]+)\/attendance(?:\/(scan))?$/.exec(pathname);
  if (eventAttendanceMatch) {
    const eventId = eventAttendanceMatch[1] ?? '';
    const scanSubpath = eventAttendanceMatch[2];
    const ev = demoEvents.find((e) => e.id === eventId) ?? demoEvents[0]!;
    if (upperMethod === 'GET') {
      const records = demoAttendance.filter((a) => a.eventId === ev.id);
      const valid = records.filter((a) => a.status === 'valid');
      const res: EventAttendanceListResponse = {
        summary: {
          eventId: ev.id,
          totalValid: valid.length,
          totalVoided: records.filter((a) => a.status === 'voided').length,
          uniqueAttendees: new Set(valid.map((v) => v.personId)).size,
          capacity: ev.capacity,
          remainingCapacity: ev.capacity !== null ? Math.max(0, ev.capacity - valid.length) : null,
          byMethod: {
            event_qr: valid.filter((v) => v.method === 'event_qr').length,
            person_qr: valid.filter((v) => v.method === 'person_qr').length,
            manual: valid.filter((v) => v.method === 'manual').length,
          },
          bySession: ev.sessions.map((s) => ({
            sessionId: s.id,
            sessionNumber: s.sessionNumber,
            label: s.title,
            validCount: valid.filter((v) => v.sessionId === s.id).length,
          })),
          medianClientDurationMs: 2800,
        },
        records,
      };
      return res as unknown as T;
    }

    if (upperMethod === 'POST') {
      const tokenOrIdentifier = scanSubpath
        ? String(payload['qrToken'] ?? '').trim()
        : String(payload['identifier'] ?? '').trim();
      const person =
        demoPeople.find(
          (p) =>
            p.qrToken.toUpperCase() === tokenOrIdentifier.toUpperCase() ||
            p.documentNumber === tokenOrIdentifier ||
            p.institutionalCode === tokenOrIdentifier,
        ) ?? demoPeople[0]!;

      const activeSession = ev.sessions[0]!;
      const existing = demoAttendance.find(
        (a) => a.eventId === ev.id && a.personId === person.id && a.status === 'valid',
      );
      if (existing) {
        const dupRes: PublicCheckinSubmitResponse = {
          outcome: 'already_registered',
          attendanceId: existing.id,
          checkedInAt: existing.checkedInAt,
          maskedName: person.abbreviatedName,
          maskedDocument: `${person.documentType} ${person.maskedDocument}`,
          sessionNumber: activeSession.sessionNumber,
          sessionLabel: activeSession.title,
          message: `${person.fullName} ya tenía asistencia registrada en esta sesión.`,
        };
        return dupRes as unknown as T;
      }

      const rec: AttendanceRecordDto = {
        id: nextDemoId(),
        organizationId: ORG_ID,
        eventId: ev.id,
        sessionId: activeSession.id,
        sessionNumber: activeSession.sessionNumber,
        sessionLabel: activeSession.title,
        personId: person.id,
        personFullName: person.fullName,
        personDocumentType: person.documentType,
        personDocumentNumber: person.maskedDocument,
        personInstitutionalCode: person.institutionalCode,
        personType: person.personType,
        method: scanSubpath ? 'person_qr' : 'manual',
        registeredBy: demoUser.id,
        status: 'valid',
        checkedInAt: new Date().toISOString(),
        clientDurationMs: 1500,
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
      };
      demoAttendance = [rec, ...demoAttendance];
      const okRes: PublicCheckinSubmitResponse = {
        outcome: 'registered',
        attendanceId: rec.id,
        checkedInAt: rec.checkedInAt,
        maskedName: person.abbreviatedName,
        maskedDocument: `${person.documentType} ${person.maskedDocument}`,
        sessionNumber: activeSession.sessionNumber,
        sessionLabel: activeSession.title,
        message: `Asistencia registrada para ${person.fullName}.`,
      };
      return okRes as unknown as T;
    }
  }

  const voidAttendanceMatch = /^\/attendance\/([^/]+)\/void$/.exec(pathname);
  if (voidAttendanceMatch && upperMethod === 'POST') {
    const attId = voidAttendanceMatch[1] ?? '';
    demoAttendance = demoAttendance.map((a) =>
      a.id === attId
        ? {
            ...a,
            status: 'voided',
            voidedAt: new Date().toISOString(),
            voidedBy: demoUser.id,
            voidReason: String(payload['reason'] ?? 'Anulado en demostración'),
          }
        : a,
    );
    return demoAttendance.find((a) => a.id === attId) as unknown as T;
  }

  // 6. Certificados
  if (pathname === '/certificate-templates' && upperMethod === 'GET') {
    return demoCertTemplates as unknown as T;
  }

  if (pathname === '/certificate-templates' && upperMethod === 'POST') {
    const created: CertificateTemplateDto = {
      id: nextDemoId(),
      organizationId: ORG_ID,
      title: String(payload['title'] ?? 'CERTIFICADO DE ASISTENCIA'),
      bodyTemplate: String(payload['bodyTemplate'] ?? '{{fullName}} — {{eventName}}'),
      logoUrl: null,
      signers: (payload['signers'] as CertificateTemplateDto['signers']) ?? [
        { name: 'Coordinación General', role: 'Dirección' },
      ],
      orientation: 'landscape',
      version: 1,
      isDefault: Boolean(payload['isDefault']),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    demoCertTemplates = [created, ...demoCertTemplates];
    return created as unknown as T;
  }

  const certEvalMatch = /^\/events\/([^/]+)\/certificates\/evaluate$/.exec(pathname);
  if (certEvalMatch && upperMethod === 'POST') {
    const eventId = certEvalMatch[1] ?? '';
    const ev = demoEvents.find((e) => e.id === eventId) ?? demoEvents[0]!;
    const validAtt = demoAttendance.filter((a) => a.eventId === eventId && a.status === 'valid');
    const eligible: EligibilityEvaluationItem[] = validAtt.map((att) => {
      const existingCert = demoCertificates.find(
        (c) => c.eventId === eventId && c.personId === att.personId && c.status === 'issued',
      );
      return {
        personId: att.personId,
        fullName: att.personFullName,
        maskedDocument: `${att.personDocumentType} ${att.personDocumentNumber}`,
        email: demoPeople.find((p) => p.id === att.personId)?.email ?? null,
        attendedSessions: 1,
        totalSessions: 1,
        attendancePercent: 100,
        eligible: true,
        reason: 'Cumple con la regla de asistencia del evento (1/1 sesión)',
        alreadyIssued: Boolean(existingCert),
        certificateId: existingCert?.id ?? null,
        certificateCode: existingCert?.code ?? null,
      };
    });
    const evalRes: EvaluateEventCertificatesResponse = {
      eventId,
      eventName: ev.name,
      ruleSummary: 'Asistencia a cualquier sesión (4 horas)',
      totalEvaluated: eligible.length,
      eligibleCount: eligible.length,
      ineligibleCount: 0,
      alreadyIssuedCount: eligible.filter((i) => i.alreadyIssued).length,
      eligible,
      ineligible: [],
    };
    return evalRes as unknown as T;
  }

  const eventCertsMatch = /^\/events\/([^/]+)\/certificates$/.exec(pathname);
  if (eventCertsMatch && upperMethod === 'GET') {
    const eventId = eventCertsMatch[1] ?? '';
    return demoCertificates.filter((c) => c.eventId === eventId) as unknown as T;
  }

  const issueCertsMatch = /^\/events\/([^/]+)\/certificates\/issue$/.exec(pathname);
  if (issueCertsMatch && upperMethod === 'POST') {
    const eventId = issueCertsMatch[1] ?? '';
    const ev = demoEvents.find((e) => e.id === eventId) ?? demoEvents[0]!;
    const validAtt = demoAttendance.filter((a) => a.eventId === eventId && a.status === 'valid');
    const newlyIssued: CertificateDto[] = [];

    for (const att of validAtt) {
      const exists = demoCertificates.some(
        (c) => c.eventId === eventId && c.personId === att.personId && c.status === 'issued',
      );
      if (exists) continue;
      const code = `TAP-2026-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const personEmail = demoPeople.find((p) => p.id === att.personId)?.email ?? null;
      const cert: CertificateDto = {
        id: nextDemoId(),
        organizationId: ORG_ID,
        eventId,
        personId: att.personId,
        templateId: TEMPLATE_1_ID,
        code,
        status: 'issued',
        holderName: att.personFullName,
        maskedDocument: `${att.personDocumentType} ${att.personDocumentNumber}`,
        recipientEmail: personEmail,
        eventName: ev.name,
        eventDate: '5 de noviembre de 2026',
        hours: '4',
        pdfSha256: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
        issuedAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString(),
        revokedAt: null,
        revokedReason: null,
        verificationCount: 0,
      };
      demoCertificates = [cert, ...demoCertificates];
      newlyIssued.push(cert);

      if (personEmail) {
        demoNotifications = [
          {
            id: nextDemoId(),
            organizationId: ORG_ID,
            channel: 'email',
            template: 'certificate_issued',
            recipient: personEmail,
            subject: `Tu certificado de participación: ${ev.name}`,
            status: 'sent',
            attempts: 1,
            lastError: null,
            relatedEntityType: 'certificate',
            relatedEntityId: cert.id,
            deduplicationKey: `cert-${cert.id}`,
            sentAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
          ...demoNotifications,
        ];
      }
    }

    const issueRes: IssueEventCertificatesResponse = {
      eventId,
      issuedCount: newlyIssued.length,
      skippedAlreadyIssuedCount: validAtt.length - newlyIssued.length,
      ineligibleCount: 0,
      certificates: demoCertificates.filter((c) => c.eventId === eventId),
    };
    return issueRes as unknown as T;
  }

  const revokeCertMatch = /^\/certificates\/([^/]+)\/revoke$/.exec(pathname);
  if (revokeCertMatch && upperMethod === 'POST') {
    const certId = revokeCertMatch[1] ?? '';
    demoCertificates = demoCertificates.map((c) =>
      c.id === certId
        ? {
            ...c,
            status: 'revoked',
            revokedAt: new Date().toISOString(),
            revokedReason: String(payload['reason'] ?? 'Revocado por solicitud administrativa'),
          }
        : c,
    );
    return demoCertificates.find((c) => c.id === certId) as unknown as T;
  }

  const resendCertMatch = /^\/certificates\/([^/]+)\/resend$/.exec(pathname);
  if (resendCertMatch && upperMethod === 'POST') {
    return { queued: true } as unknown as T;
  }

  const publicVerifyCertMatch = /^\/public\/certificates\/([^/]+)$/.exec(pathname);
  if (publicVerifyCertMatch && upperMethod === 'GET') {
    const code = decodeURIComponent(publicVerifyCertMatch[1] ?? '').toUpperCase();
    const cert =
      demoCertificates.find((c) => c.code.toUpperCase() === code) ?? demoCertificates[0]!;
    const res: PublicCertificateVerificationResponse = {
      found: true,
      status: cert.status === 'issued' ? 'valid' : 'revoked',
      code: cert.code,
      holderName: cert.holderName,
      eventName: cert.eventName,
      eventDate: cert.eventDate,
      organizationName: demoOrganization.name,
      hours: cert.hours,
      issuedAt: cert.issuedAt,
      pdfSha256: cert.pdfSha256,
      revokedAt: cert.revokedAt,
      revokedReason: cert.revokedReason,
    };
    return res as unknown as T;
  }

  // 7. Inventario (/inventory/*)
  if (pathname === '/inventory/categories' && upperMethod === 'GET') {
    return demoCategories as unknown as T;
  }

  if (pathname === '/inventory/categories' && upperMethod === 'POST') {
    const created: InventoryCategoryDto = {
      id: nextDemoId(),
      organizationId: ORG_ID,
      name: String(payload['name'] ?? 'Nueva Categoría'),
      defaultLoanDurationHours: Number(payload['defaultLoanDurationHours'] ?? 4),
      maxUnitsPerBorrower: Number(payload['maxUnitsPerBorrower'] ?? 2),
      createdAt: new Date().toISOString(),
    };
    demoCategories = [...demoCategories, created];
    return created as unknown as T;
  }

  if (pathname === '/inventory/models' && upperMethod === 'GET') {
    syncModelCounts();
    return demoModels as unknown as T;
  }

  if (pathname === '/inventory/models' && upperMethod === 'POST') {
    const cat = demoCategories.find((c) => c.id === payload['categoryId']) ?? demoCategories[0]!;
    const created: ItemModelDto = {
      id: nextDemoId(),
      organizationId: ORG_ID,
      categoryId: cat.id,
      categoryName: cat.name,
      name: String(payload['name'] ?? 'Implemento Deportivo'),
      codePrefix: String(payload['codePrefix'] ?? 'IMP').toUpperCase(),
      description: (payload['description'] as string | null) ?? null,
      trackingType: 'trackable',
      loanDurationHours: 4,
      totalUnitsCount: 0,
      availableUnitsCount: 0,
      loanedUnitsCount: 0,
      createdAt: new Date().toISOString(),
    };
    demoModels = [...demoModels, created];
    return created as unknown as T;
  }

  if (pathname === '/inventory/units' && upperMethod === 'GET') {
    return demoUnits as unknown as T;
  }

  const bulkCreateModelMatch = /^\/inventory\/models\/([^/]+)\/units\/bulk$/.exec(pathname);
  if ((pathname === '/inventory/units/bulk' || bulkCreateModelMatch) && upperMethod === 'POST') {
    const modelId = bulkCreateModelMatch?.[1] ?? String(payload['modelId'] ?? MODEL_1_ID);
    const model = demoModels.find((m) => m.id === modelId) ?? demoModels[0]!;
    const quantity = Math.min(20, Math.max(1, Number(payload['quantity'] ?? 3)));
    const startNumber = Math.max(1, Number(payload['startNumber'] ?? demoUnits.length + 1));
    const createdUnits: InventoryUnitDto[] = [];
    for (let i = 0; i < quantity; i++) {
      const num = String(startNumber + i).padStart(3, '0');
      const code = `${model.codePrefix}-${num}`;
      const unit: InventoryUnitDto = {
        id: nextDemoId(),
        organizationId: ORG_ID,
        modelId: model.id,
        modelName: model.name,
        categoryName: model.categoryName,
        siteId: SITE_ID,
        code,
        qrToken: `UNIT-${code}`,
        condition: 'new',
        status: 'available',
        notes: null,
        createdAt: new Date().toISOString(),
      };
      demoUnits = [...demoUnits, unit];
      createdUnits.push(unit);
    }
    syncModelCounts();
    return createdUnits as unknown as T;
  }

  const unitStatusMatch = /^\/inventory\/units\/([^/]+)\/status$/.exec(pathname);
  if (unitStatusMatch && upperMethod === 'PATCH') {
    const unitId = unitStatusMatch[1] ?? '';
    const nextStatus = (payload['status'] as InventoryUnitDto['status']) ?? 'available';
    demoUnits = demoUnits.map((u) => (u.id === unitId ? { ...u, status: nextStatus } : u));
    syncModelCounts();
    return demoUnits.find((u) => u.id === unitId) as unknown as T;
  }

  // 8. Préstamos (/loans/* y /public/loans/:code)
  if (pathname === '/loans' && upperMethod === 'GET') {
    return demoLoans as unknown as T;
  }

  if (pathname === '/loans/lending-points' && upperMethod === 'GET') {
    return demoLendingPoints as unknown as T;
  }

  if (pathname === '/loans/lending-points' && upperMethod === 'POST') {
    const created: LendingPointDto = {
      id: nextDemoId(),
      organizationId: ORG_ID,
      siteId: SITE_ID,
      name: String(payload['name'] ?? 'Nuevo Punto de Préstamo'),
      publicCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
      isOpen: true,
      requireOperatorApproval: false,
      createdAt: new Date().toISOString(),
    };
    demoLendingPoints = [...demoLendingPoints, created];
    return created as unknown as T;
  }

  const returnLoanByIdMatch = /^\/loans\/([^/]+)\/return$/.exec(pathname);
  if ((pathname === '/loans/return-by-qr' || returnLoanByIdMatch) && upperMethod === 'POST') {
    const loanIdFromPath = returnLoanByIdMatch?.[1];
    const raw = String(payload['unitQrOrCode'] ?? payload['unitQrOrAssetCode'] ?? '')
      .trim()
      .toUpperCase();
    const activeLoan = loanIdFromPath
      ? demoLoans.find((l) => l.id === loanIdFromPath)
      : (demoLoans.find(
          (l) =>
            (l.status === 'active' || l.status === 'overdue') &&
            (l.unitCode.toUpperCase() === raw || l.unitQrToken.toUpperCase() === raw),
        ) ?? demoLoans.find((l) => l.status === 'active' || l.status === 'overdue'));

    if (activeLoan) {
      demoLoans = demoLoans.map((l) =>
        l.id === activeLoan.id
          ? {
              ...l,
              status: 'returned',
              returnedAt: new Date().toISOString(),
              conditionIn: 'good',
            }
          : l,
      );
      demoUnits = demoUnits.map((u) =>
        u.id === activeLoan.unitId ? { ...u, status: 'available' } : u,
      );
      syncModelCounts();
      return demoLoans.find((l) => l.id === activeLoan.id) as unknown as T;
    }
    return demoLoans[0] as unknown as T;
  }

  if (pathname === '/loans/sweep-overdue' && upperMethod === 'POST') {
    const sweepRes: OverdueSweepResponse = {
      evaluatedCount: demoLoans.filter((l) => l.status === 'active').length,
      newlyMarkedOverdueCount: 0,
      notificationsEnqueuedCount: 0,
    };
    return sweepRes as unknown as T;
  }

  const publicLoanInfoMatch = /^\/public\/loans\/([^/]+)$/.exec(pathname);
  if (publicLoanInfoMatch && upperMethod === 'GET') {
    syncModelCounts();
    const point = demoLendingPoints[0]!;
    const res: PublicLendingPointInfo = {
      id: point.id,
      name: point.name,
      publicCode: point.publicCode,
      isOpen: point.isOpen,
      organization: {
        name: demoOrganization.name,
        dataConsentVersion: demoOrganization.dataConsentVersion,
        dataConsentText: demoOrganization.dataConsentText,
      },
      availableModels: demoModels.map((m) => ({
        id: m.id,
        name: m.name,
        categoryName: m.categoryName,
        codePrefix: m.codePrefix,
        availableCount: m.availableUnitsCount,
        loanDurationHours: m.loanDurationHours,
      })),
    };
    return res as unknown as T;
  }

  const publicLoanLookupMatch = /^\/public\/loans\/([^/]+)\/lookup$/.exec(pathname);
  if (publicLoanLookupMatch && upperMethod === 'POST') {
    const identifier = String(payload['identifier'] ?? '').trim();
    const found = demoPeople.find(
      (p) => p.documentNumber === identifier || p.institutionalCode === identifier,
    );
    const lookupRes: PublicBorrowerLookupResponse = {
      found: Boolean(found),
      maskedName: found?.abbreviatedName ?? null,
      maskedDocument: found ? `${found.documentType} ${found.maskedDocument}` : null,
      eligible: true,
      ineligibilityReason: null,
    };
    return lookupRes as unknown as T;
  }

  if (publicLoanInfoMatch && upperMethod === 'POST') {
    const identifier = String(payload['identifier'] ?? '').trim();
    const modelId = String(payload['modelId'] ?? MODEL_1_ID);
    const person =
      demoPeople.find(
        (p) => p.documentNumber === identifier || p.institutionalCode === identifier,
      ) ?? demoPeople[0]!;
    const unit =
      demoUnits.find((u) => u.modelId === modelId && u.status === 'available') ??
      demoUnits.find((u) => u.status === 'available') ??
      demoUnits[1]!;
    const model = demoModels.find((m) => m.id === unit.modelId) ?? demoModels[0]!;

    demoUnits = demoUnits.map((u) => (u.id === unit.id ? { ...u, status: 'loaned' } : u));
    syncModelCounts();

    const now = new Date();
    const due = new Date(now.getTime() + 4 * 3600_000);
    const createdLoan: LoanDto = {
      id: nextDemoId(),
      organizationId: ORG_ID,
      siteId: SITE_ID,
      lendingPointId: POINT_1_ID,
      lendingPointName: 'Ventanilla de Implementos Deportivos',
      unitId: unit.id,
      unitCode: unit.code,
      unitQrToken: unit.qrToken,
      modelId: model.id,
      modelName: model.name,
      personId: person.id,
      borrowerName: person.fullName,
      maskedDocument: `${person.documentType} ${person.maskedDocument}`,
      borrowerEmail: person.email,
      status: 'active',
      conditionOut: unit.condition,
      conditionIn: null,
      signatureSha256:
        crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
      deliveredAt: now.toISOString(),
      dueAt: due.toISOString(),
      returnedAt: null,
      returnNotes: null,
      createdAt: now.toISOString(),
    };
    demoLoans = [createdLoan, ...demoLoans];
    return createdLoan as unknown as T;
  }

  // 9. Notificaciones (/notifications)
  if (pathname === '/notifications' && upperMethod === 'GET') {
    const res: ListNotificationsResponse = {
      totalCount: demoNotifications.length,
      sentCount: demoNotifications.filter((n) => n.status === 'sent').length,
      queuedCount: demoNotifications.filter((n) => n.status === 'queued').length,
      failedCount: demoNotifications.filter((n) => n.status === 'failed').length,
      items: demoNotifications,
    };
    return res as unknown as T;
  }

  // 10. Reportes (/reports/dashboard)
  if (pathname === '/reports/dashboard' && upperMethod === 'GET') {
    syncModelCounts();
    const dashboard: DashboardSummaryResponse = {
      kpis: {
        totalEvents: demoEvents.length,
        openEvents: demoEvents.filter((e) => e.status === 'open').length,
        totalCheckins: demoAttendance.filter((a) => a.status === 'valid').length,
        issuedCertificates: demoCertificates.filter((c) => c.status === 'issued').length,
        totalInventoryUnits: demoUnits.length,
        availableInventoryUnits: demoUnits.filter((u) => u.status === 'available').length,
        activeLoans: demoLoans.filter((l) => l.status === 'active').length,
        overdueLoans: demoLoans.filter((l) => l.status === 'overdue').length,
      },
      attendanceByEvent: demoEvents.map((ev) => ({
        eventId: ev.id,
        eventName: ev.name,
        publicCode: ev.publicCode,
        checkinsCount: demoAttendance.filter((a) => a.eventId === ev.id && a.status === 'valid')
          .length,
        certificatesCount: demoCertificates.filter(
          (c) => c.eventId === ev.id && c.status === 'issued',
        ).length,
      })),
      loansByModel: demoModels.map((m) => ({
        modelId: m.id,
        modelName: m.name,
        availableCount: m.availableUnitsCount,
        loanedCount: m.loanedUnitsCount,
        totalLoansHistoric: demoLoans.filter((l) => l.modelId === m.id).length,
      })),
      loanStatusBreakdown: [
        {
          status: 'active',
          label: 'Activos',
          count: demoLoans.filter((l) => l.status === 'active').length,
        },
        {
          status: 'returned',
          label: 'Devueltos',
          count: demoLoans.filter((l) => l.status === 'returned').length,
        },
        {
          status: 'overdue',
          label: 'En mora',
          count: demoLoans.filter((l) => l.status === 'overdue').length,
        },
      ],
    };
    return dashboard as unknown as T;
  }

  return {} as T;
}

export function createDemoDownloadBlob(normalizedPath: string, fallbackFilename: string): Blob {
  if (fallbackFilename.endsWith('.csv') || normalizedPath.includes('format=csv')) {
    const csv = [
      'id,participante,documento_enmascarado,evento_o_modelo,estado,fecha',
      ...demoAttendance.map(
        (a) =>
          `${a.id},"${a.personFullName}","${a.personDocumentType} ${a.personDocumentNumber}","Jornada de Bienestar",${a.status},${a.checkedInAt}`,
      ),
    ].join('\n');
    return new Blob([csv], { type: 'text/csv;charset=utf-8' });
  }

  const content = `TAP — PLATAFORMA DE BIENESTAR UNIVERSITARIO\nArchivo generado en Modo Demostración Interactivo: ${fallbackFilename}\nFecha: ${new Date().toISOString()}\nVerificación SHA-256: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08\n`;
  return new Blob([content], { type: 'text/plain;charset=utf-8' });
}
