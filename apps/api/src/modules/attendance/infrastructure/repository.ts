import type { AttendanceMethod, AttendanceStatus } from '@tap/contracts';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { DrizzleExecutor } from '../../../shared/index.ts';
import type { AttendanceRecord, EventPreregistrationRecord } from '../domain/entities.ts';
import type { AttendanceRepository, InsertCheckinResult } from '../domain/ports.ts';
import { attendanceRecordsTable, eventPreregistrationsTable } from './schema.ts';

function mapRowToRecord(row: typeof attendanceRecordsTable.$inferSelect): AttendanceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    eventId: row.eventId,
    sessionId: row.sessionId,
    personId: row.personId,
    checkedInAt: row.checkedInAt,
    method: row.method as AttendanceMethod,
    registeredBy: row.registeredBy,
    status: row.status as AttendanceStatus,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt,
    voidedBy: row.voidedBy,
    clientDurationMs: row.clientDurationMs,
    ipHash: row.ipHash,
    userAgent: row.userAgent,
  };
}

export class DrizzleAttendanceRepository implements AttendanceRepository {
  private readonly db: DrizzleExecutor;

  constructor(db: DrizzleExecutor) {
    this.db = db;
  }

  async insertCheckinIfNotExists(record: AttendanceRecord): Promise<InsertCheckinResult> {
    const insertedRows = await this.db
      .insert(attendanceRecordsTable)
      .values({
        id: record.id,
        organizationId: record.organizationId,
        eventId: record.eventId,
        sessionId: record.sessionId,
        personId: record.personId,
        checkedInAt: record.checkedInAt,
        method: record.method,
        registeredBy: record.registeredBy,
        status: 'valid',
        voidReason: null,
        voidedAt: null,
        voidedBy: null,
        clientDurationMs: record.clientDurationMs,
        ipHash: record.ipHash,
        userAgent: record.userAgent,
      })
      .onConflictDoNothing({
        target: [
          attendanceRecordsTable.eventId,
          attendanceRecordsTable.sessionId,
          attendanceRecordsTable.personId,
        ],
        where: sql`${attendanceRecordsTable.status} = 'valid'`,
      })
      .returning();

    const inserted = insertedRows[0];
    if (inserted) {
      return { inserted: true, record: mapRowToRecord(inserted) };
    }

    const existingRows = await this.db
      .select()
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.organizationId, record.organizationId),
          eq(attendanceRecordsTable.eventId, record.eventId),
          eq(attendanceRecordsTable.sessionId, record.sessionId),
          eq(attendanceRecordsTable.personId, record.personId),
          eq(attendanceRecordsTable.status, 'valid'),
        ),
      )
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      return { inserted: false, record };
    }
    return { inserted: false, record: mapRowToRecord(existing) };
  }

  async findById(organizationId: string, attendanceId: string): Promise<AttendanceRecord | null> {
    const rows = await this.db
      .select()
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.organizationId, organizationId),
          eq(attendanceRecordsTable.id, attendanceId),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? mapRowToRecord(row) : null;
  }

  async listByEvent(
    organizationId: string,
    eventId: string,
    filters?: {
      sessionId?: string;
      status?: AttendanceStatus;
    },
  ): Promise<AttendanceRecord[]> {
    const conditions = [
      eq(attendanceRecordsTable.organizationId, organizationId),
      eq(attendanceRecordsTable.eventId, eventId),
    ];
    if (filters?.sessionId) {
      conditions.push(eq(attendanceRecordsTable.sessionId, filters.sessionId));
    }
    if (filters?.status) {
      conditions.push(eq(attendanceRecordsTable.status, filters.status));
    }

    const rows = await this.db
      .select()
      .from(attendanceRecordsTable)
      .where(and(...conditions))
      .orderBy(desc(attendanceRecordsTable.checkedInAt));

    return rows.map(mapRowToRecord);
  }

  async countValidByEvent(organizationId: string, eventId: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.organizationId, organizationId),
          eq(attendanceRecordsTable.eventId, eventId),
          eq(attendanceRecordsTable.status, 'valid'),
        ),
      );
    return Number(rows[0]?.value ?? 0);
  }

  async voidRecord(params: {
    organizationId: string;
    attendanceId: string;
    reason: string;
    voidedAt: Date;
    voidedBy: string;
  }): Promise<AttendanceRecord | null> {
    const rows = await this.db
      .update(attendanceRecordsTable)
      .set({
        status: 'voided',
        voidReason: params.reason,
        voidedAt: params.voidedAt,
        voidedBy: params.voidedBy,
      })
      .where(
        and(
          eq(attendanceRecordsTable.organizationId, params.organizationId),
          eq(attendanceRecordsTable.id, params.attendanceId),
          eq(attendanceRecordsTable.status, 'valid'),
        ),
      )
      .returning();

    const row = rows[0];
    return row ? mapRowToRecord(row) : null;
  }

  async upsertPreregistration(
    record: EventPreregistrationRecord,
  ): Promise<EventPreregistrationRecord> {
    const insertedRows = await this.db
      .insert(eventPreregistrationsTable)
      .values({
        id: record.id,
        organizationId: record.organizationId,
        eventId: record.eventId,
        personId: record.personId,
        email: record.email,
        createdAt: record.createdAt,
      })
      .onConflictDoNothing({
        target: [eventPreregistrationsTable.eventId, eventPreregistrationsTable.personId],
      })
      .returning();

    const row = insertedRows[0];
    if (row) {
      return {
        id: row.id,
        organizationId: row.organizationId,
        eventId: row.eventId,
        personId: row.personId,
        email: row.email,
        createdAt: row.createdAt,
      };
    }

    const existing = await this.db
      .select()
      .from(eventPreregistrationsTable)
      .where(
        and(
          eq(eventPreregistrationsTable.organizationId, record.organizationId),
          eq(eventPreregistrationsTable.eventId, record.eventId),
          eq(eventPreregistrationsTable.personId, record.personId),
        ),
      )
      .limit(1);

    const found = existing[0];
    return found
      ? {
          id: found.id,
          organizationId: found.organizationId,
          eventId: found.eventId,
          personId: found.personId,
          email: found.email,
          createdAt: found.createdAt,
        }
      : record;
  }

  async listPreregistrationsByEvent(
    organizationId: string,
    eventId: string,
  ): Promise<EventPreregistrationRecord[]> {
    const rows = await this.db
      .select()
      .from(eventPreregistrationsTable)
      .where(
        and(
          eq(eventPreregistrationsTable.organizationId, organizationId),
          eq(eventPreregistrationsTable.eventId, eventId),
        ),
      )
      .orderBy(desc(eventPreregistrationsTable.createdAt));

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      eventId: row.eventId,
      personId: row.personId,
      email: row.email,
      createdAt: row.createdAt,
    }));
  }
}

export class InMemoryAttendanceRepository implements AttendanceRepository {
  private readonly recordsById = new Map<string, AttendanceRecord>();
  private readonly validKeyIndex = new Map<string, string>();
  private readonly preregistrations = new Map<string, EventPreregistrationRecord>();

  private buildValidKey(eventId: string, sessionId: string, personId: string): string {
    return `${eventId}:${sessionId}:${personId}`;
  }

  async insertCheckinIfNotExists(record: AttendanceRecord): Promise<InsertCheckinResult> {
    const validKey = this.buildValidKey(record.eventId, record.sessionId, record.personId);
    const existingId = this.validKeyIndex.get(validKey);
    if (existingId) {
      const existing = this.recordsById.get(existingId);
      if (existing && existing.status === 'valid') {
        return { inserted: false, record: existing };
      }
    }

    this.recordsById.set(record.id, record);
    this.validKeyIndex.set(validKey, record.id);
    return { inserted: true, record };
  }

  async findById(organizationId: string, attendanceId: string): Promise<AttendanceRecord | null> {
    const found = this.recordsById.get(attendanceId);
    if (!found || found.organizationId !== organizationId) {
      return null;
    }
    return found;
  }

  async listByEvent(
    organizationId: string,
    eventId: string,
    filters?: {
      sessionId?: string;
      status?: AttendanceStatus;
    },
  ): Promise<AttendanceRecord[]> {
    const items: AttendanceRecord[] = [];
    for (const record of this.recordsById.values()) {
      if (record.organizationId !== organizationId || record.eventId !== eventId) {
        continue;
      }
      if (filters?.sessionId && record.sessionId !== filters.sessionId) {
        continue;
      }
      if (filters?.status && record.status !== filters.status) {
        continue;
      }
      items.push(record);
    }
    items.sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime());
    return items;
  }

  async countValidByEvent(organizationId: string, eventId: string): Promise<number> {
    let total = 0;
    for (const record of this.recordsById.values()) {
      if (
        record.organizationId === organizationId &&
        record.eventId === eventId &&
        record.status === 'valid'
      ) {
        total += 1;
      }
    }
    return total;
  }

  async voidRecord(params: {
    organizationId: string;
    attendanceId: string;
    reason: string;
    voidedAt: Date;
    voidedBy: string;
  }): Promise<AttendanceRecord | null> {
    const existing = this.recordsById.get(params.attendanceId);
    if (
      !existing ||
      existing.organizationId !== params.organizationId ||
      existing.status !== 'valid'
    ) {
      return null;
    }

    const updated: AttendanceRecord = {
      ...existing,
      status: 'voided',
      voidReason: params.reason,
      voidedAt: params.voidedAt,
      voidedBy: params.voidedBy,
    };
    this.recordsById.set(updated.id, updated);
    const validKey = this.buildValidKey(existing.eventId, existing.sessionId, existing.personId);
    this.validKeyIndex.delete(validKey);
    return updated;
  }

  async upsertPreregistration(
    record: EventPreregistrationRecord,
  ): Promise<EventPreregistrationRecord> {
    const key = `${record.eventId}:${record.personId}`;
    const existing = this.preregistrations.get(key);
    if (existing) {
      return existing;
    }
    this.preregistrations.set(key, record);
    return record;
  }

  async listPreregistrationsByEvent(
    organizationId: string,
    eventId: string,
  ): Promise<EventPreregistrationRecord[]> {
    const items: EventPreregistrationRecord[] = [];
    for (const item of this.preregistrations.values()) {
      if (item.organizationId === organizationId && item.eventId === eventId) {
        items.push(item);
      }
    }
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return items;
  }
}
