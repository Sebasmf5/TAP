import type { ConsentChannel, DocumentType, PersonType } from '@tap/contracts';
import type { AuditLog, Clock, DrizzleExecutor, IdGenerator } from '../../shared/index.ts';
import { PeopleService } from './application/use-cases.ts';
import {
  abbreviatePersonName,
  maskDocumentNumber,
  parseCsvPeople,
  toPersonDto,
  validateMinorGuardian,
  type DataConsent,
  type ParsedCsvPersonRow,
  type Person,
} from './domain/entities.ts';
import type { PeopleRepository } from './domain/ports.ts';
import { createPeopleRoutes, type AuthenticateRequestFn } from './http/routes.ts';
import { DrizzlePeopleRepository, InMemoryPeopleRepository } from './infrastructure/repository.ts';
import { consentsTable, peopleSchema, peopleTable } from './infrastructure/schema.ts';

export interface PeopleModule {
  readonly service: PeopleService;
  readonly repository: PeopleRepository;
  findById(organizationId: string, personId: string): Promise<Person | null>;
  findByDocument(
    organizationId: string,
    documentNumber: string,
    documentType?: DocumentType,
  ): Promise<Person | null>;
  findByInstitutionalCode(organizationId: string, code: string): Promise<Person | null>;
  findByQrToken(organizationId: string, qrToken: string): Promise<Person | null>;
  recordConsent(params: {
    organizationId: string;
    personId: string;
    version: string;
    channel: ConsentChannel;
    ipHash?: string | null;
  }): Promise<DataConsent>;
  registerPublicWalkInPerson(params: {
    organizationId: string;
    documentType: DocumentType;
    documentNumber: string;
    fullName: string;
    institutionalCode?: string | null;
    email?: string | null;
    phone?: string | null;
    personType?: PersonType;
    isMinor: boolean;
    guardianName?: string | null;
    guardianDocument?: string | null;
    guardianPhone?: string | null;
    consentVersion: string;
    channel: ConsentChannel;
    ipHash?: string | null;
  }): Promise<Person>;
  createRoutes(authenticate: AuthenticateRequestFn): ReturnType<typeof createPeopleRoutes>;
}

export function createPeopleModule(params: {
  db?: DrizzleExecutor;
  repository?: PeopleRepository;
  idGenerator: IdGenerator;
  clock: Clock;
  auditLog: AuditLog;
}): PeopleModule {
  const repository =
    params.repository ??
    (params.db ? new DrizzlePeopleRepository(params.db) : new InMemoryPeopleRepository());

  const service = new PeopleService({
    repository,
    idGenerator: params.idGenerator,
    clock: params.clock,
    auditLog: params.auditLog,
  });

  return {
    service,
    repository,
    findById(organizationId: string, personId: string) {
      return repository.findById(organizationId, personId);
    },
    findByDocument(organizationId: string, documentNumber: string, documentType?: DocumentType) {
      return service.findByDocumentInternal(organizationId, documentNumber, documentType);
    },
    findByInstitutionalCode(organizationId: string, code: string) {
      return service.findByInstitutionalCodeInternal(organizationId, code);
    },
    findByQrToken(organizationId: string, qrToken: string) {
      return service.findByQrTokenInternal(organizationId, qrToken);
    },
    recordConsent(consentParams) {
      return service.recordConsentInternal(consentParams);
    },
    registerPublicWalkInPerson(walkInParams) {
      return service.registerPublicWalkInPersonInternal(walkInParams);
    },
    createRoutes(authenticate: AuthenticateRequestFn) {
      return createPeopleRoutes({ service, authenticate });
    },
  };
}

export {
  DrizzlePeopleRepository,
  InMemoryPeopleRepository,
  PeopleService,
  abbreviatePersonName,
  consentsTable,
  createPeopleRoutes,
  maskDocumentNumber,
  parseCsvPeople,
  peopleSchema,
  peopleTable,
  toPersonDto,
  validateMinorGuardian,
  type AuthenticateRequestFn,
  type DataConsent,
  type ParsedCsvPersonRow,
  type PeopleRepository,
  type Person,
};
