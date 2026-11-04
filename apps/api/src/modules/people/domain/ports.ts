import type { DocumentType } from '@tap/contracts';
import type { DataConsent, Person } from './entities.ts';

export interface PeopleRepository {
  findById(organizationId: string, personId: string): Promise<Person | null>;
  findByDocument(
    organizationId: string,
    documentNumber: string,
    documentType?: DocumentType,
  ): Promise<Person | null>;
  findByInstitutionalCode(
    organizationId: string,
    institutionalCode: string,
  ): Promise<Person | null>;
  findByQrToken(organizationId: string, qrToken: string): Promise<Person | null>;
  searchByOrganization(organizationId: string, query?: string): Promise<Person[]>;
  create(person: Person): Promise<void>;
  update(person: Person): Promise<void>;

  recordConsent(consent: DataConsent): Promise<void>;
  findLatestConsent(organizationId: string, personId: string): Promise<DataConsent | null>;
}
