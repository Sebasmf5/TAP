import type { ConsentChannel, DocumentType, PersonType } from '@tap/contracts';
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import type { DrizzleExecutor } from '../../../shared/index.ts';
import type { DataConsent, Person } from '../domain/entities.ts';
import type { PeopleRepository } from '../domain/ports.ts';
import { consentsTable, peopleTable } from './schema.ts';

function mapPersonRow(row: typeof peopleTable.$inferSelect): Person {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentType: row.documentType as DocumentType,
    documentNumber: row.documentNumber,
    institutionalCode: row.institutionalCode,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    personType: row.personType as PersonType,
    isMinor: row.isMinor,
    guardianName: row.guardianName,
    guardianDocument: row.guardianDocument,
    guardianPhone: row.guardianPhone,
    qrToken: row.qrToken,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapConsentRow(row: typeof consentsTable.$inferSelect): DataConsent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    personId: row.personId,
    version: row.version,
    acceptedAt: row.acceptedAt,
    channel: row.channel as ConsentChannel,
    ipHash: row.ipHash,
  };
}

export class DrizzlePeopleRepository implements PeopleRepository {
  private readonly db: DrizzleExecutor;

  constructor(db: DrizzleExecutor) {
    this.db = db;
  }

  async findById(organizationId: string, personId: string): Promise<Person | null> {
    const rows = await this.db
      .select()
      .from(peopleTable)
      .where(and(eq(peopleTable.organizationId, organizationId), eq(peopleTable.id, personId)))
      .limit(1);
    return rows[0] ? mapPersonRow(rows[0]) : null;
  }

  async findByDocument(
    organizationId: string,
    documentNumber: string,
    documentType?: DocumentType,
  ): Promise<Person | null> {
    const normalized = documentNumber.trim();
    const condition = documentType
      ? and(
          eq(peopleTable.organizationId, organizationId),
          eq(peopleTable.documentType, documentType),
          eq(peopleTable.documentNumber, normalized),
        )
      : and(
          eq(peopleTable.organizationId, organizationId),
          eq(peopleTable.documentNumber, normalized),
        );

    const rows = await this.db.select().from(peopleTable).where(condition).limit(1);
    return rows[0] ? mapPersonRow(rows[0]) : null;
  }

  async findByInstitutionalCode(
    organizationId: string,
    institutionalCode: string,
  ): Promise<Person | null> {
    const rows = await this.db
      .select()
      .from(peopleTable)
      .where(
        and(
          eq(peopleTable.organizationId, organizationId),
          eq(peopleTable.institutionalCode, institutionalCode.trim()),
        ),
      )
      .limit(1);
    return rows[0] ? mapPersonRow(rows[0]) : null;
  }

  async findByQrToken(organizationId: string, qrToken: string): Promise<Person | null> {
    const rows = await this.db
      .select()
      .from(peopleTable)
      .where(
        and(
          eq(peopleTable.organizationId, organizationId),
          eq(peopleTable.qrToken, qrToken.trim()),
        ),
      )
      .limit(1);
    return rows[0] ? mapPersonRow(rows[0]) : null;
  }

  async searchByOrganization(organizationId: string, query?: string): Promise<Person[]> {
    const trimmed = query?.trim();
    const condition = trimmed
      ? and(
          eq(peopleTable.organizationId, organizationId),
          or(
            ilike(peopleTable.fullName, `%${trimmed}%`),
            ilike(peopleTable.documentNumber, `%${trimmed}%`),
            ilike(peopleTable.institutionalCode, `%${trimmed}%`),
          ),
        )
      : eq(peopleTable.organizationId, organizationId);

    const rows = await this.db
      .select()
      .from(peopleTable)
      .where(condition)
      .orderBy(asc(peopleTable.fullName))
      .limit(200);
    return rows.map(mapPersonRow);
  }

  async create(person: Person): Promise<void> {
    await this.db.insert(peopleTable).values({
      id: person.id,
      organizationId: person.organizationId,
      documentType: person.documentType,
      documentNumber: person.documentNumber,
      institutionalCode: person.institutionalCode,
      fullName: person.fullName,
      email: person.email,
      phone: person.phone,
      personType: person.personType,
      isMinor: person.isMinor,
      guardianName: person.guardianName,
      guardianDocument: person.guardianDocument,
      guardianPhone: person.guardianPhone,
      qrToken: person.qrToken,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    });
  }

  async update(person: Person): Promise<void> {
    await this.db
      .update(peopleTable)
      .set({
        institutionalCode: person.institutionalCode,
        fullName: person.fullName,
        email: person.email,
        phone: person.phone,
        personType: person.personType,
        isMinor: person.isMinor,
        guardianName: person.guardianName,
        guardianDocument: person.guardianDocument,
        guardianPhone: person.guardianPhone,
        qrToken: person.qrToken,
        updatedAt: person.updatedAt,
      })
      .where(
        and(eq(peopleTable.organizationId, person.organizationId), eq(peopleTable.id, person.id)),
      );
  }

  async recordConsent(consent: DataConsent): Promise<void> {
    await this.db.insert(consentsTable).values({
      id: consent.id,
      organizationId: consent.organizationId,
      personId: consent.personId,
      version: consent.version,
      acceptedAt: consent.acceptedAt,
      channel: consent.channel,
      ipHash: consent.ipHash,
    });
  }

  async findLatestConsent(organizationId: string, personId: string): Promise<DataConsent | null> {
    const rows = await this.db
      .select()
      .from(consentsTable)
      .where(
        and(eq(consentsTable.organizationId, organizationId), eq(consentsTable.personId, personId)),
      )
      .orderBy(desc(consentsTable.acceptedAt))
      .limit(1);
    return rows[0] ? mapConsentRow(rows[0]) : null;
  }
}

export class InMemoryPeopleRepository implements PeopleRepository {
  private readonly people = new Map<string, Person>();
  private readonly consents: DataConsent[] = [];

  async findById(organizationId: string, personId: string): Promise<Person | null> {
    const person = this.people.get(personId);
    if (!person || person.organizationId !== organizationId) return null;
    return person;
  }

  async findByDocument(
    organizationId: string,
    documentNumber: string,
    documentType?: DocumentType,
  ): Promise<Person | null> {
    const normalized = documentNumber.trim();
    for (const person of this.people.values()) {
      if (person.organizationId !== organizationId) continue;
      if (documentType && person.documentType !== documentType) continue;
      if (person.documentNumber === normalized) return person;
    }
    return null;
  }

  async findByInstitutionalCode(
    organizationId: string,
    institutionalCode: string,
  ): Promise<Person | null> {
    const normalized = institutionalCode.trim();
    for (const person of this.people.values()) {
      if (person.organizationId !== organizationId) continue;
      if (person.institutionalCode === normalized) return person;
    }
    return null;
  }

  async findByQrToken(organizationId: string, qrToken: string): Promise<Person | null> {
    const normalized = qrToken.trim();
    for (const person of this.people.values()) {
      if (person.organizationId !== organizationId) continue;
      if (person.qrToken === normalized) return person;
    }
    return null;
  }

  async searchByOrganization(organizationId: string, query?: string): Promise<Person[]> {
    const q = query?.trim().toLowerCase();
    return [...this.people.values()]
      .filter((person) => {
        if (person.organizationId !== organizationId) return false;
        if (!q) return true;
        return (
          person.fullName.toLowerCase().includes(q) ||
          person.documentNumber.toLowerCase().includes(q) ||
          (person.institutionalCode?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async create(person: Person): Promise<void> {
    this.people.set(person.id, person);
  }

  async update(person: Person): Promise<void> {
    this.people.set(person.id, person);
  }

  async recordConsent(consent: DataConsent): Promise<void> {
    this.consents.push(consent);
  }

  async findLatestConsent(organizationId: string, personId: string): Promise<DataConsent | null> {
    const matches = this.consents
      .filter((c) => c.organizationId === organizationId && c.personId === personId)
      .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime());
    return matches[0] ?? null;
  }
}
