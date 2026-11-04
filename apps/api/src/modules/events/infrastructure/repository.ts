import type { EventStatus, EventType } from '@tap/contracts';
import { and, asc, desc, eq, lte } from 'drizzle-orm';
import type { DrizzleExecutor } from '../../../shared/index.ts';
import { hydrateEventEntity, type EventEntity, type EventSession } from '../domain/entities.ts';
import type { EventsRepository } from '../domain/ports.ts';
import { eventSessionsTable, eventsTable } from './schema.ts';

function mapSessionRow(row: typeof eventSessionsTable.$inferSelect): EventSession {
  return {
    id: row.id,
    organizationId: row.organizationId,
    eventId: row.eventId,
    sessionNumber: row.sessionNumber,
    title: row.title,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
  };
}

function mapEventRow(
  row: typeof eventsTable.$inferSelect,
  sessions: ReadonlyArray<EventSession>,
): EventEntity {
  return hydrateEventEntity({
    id: row.id,
    organizationId: row.organizationId,
    siteId: row.siteId,
    name: row.name,
    description: row.description,
    type: row.type as EventType,
    status: row.status as EventStatus,
    publicCode: row.publicCode,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    checkinOpensAt: row.checkinOpensAt,
    checkinClosesAt: row.checkinClosesAt,
    capacity: row.capacity,
    allowedIdentificationModes: row.allowedIdentificationModes,
    confirmIdentity: row.confirmIdentity,
    allowWalkIn: row.allowWalkIn,
    certificateRule: row.certificateRule,
    autoIssueCertificates: row.autoIssueCertificates,
    sessions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleEventsRepository implements EventsRepository {
  private readonly db: DrizzleExecutor;

  constructor(db: DrizzleExecutor) {
    this.db = db;
  }

  private async loadSessions(organizationId: string, eventId: string): Promise<EventSession[]> {
    const rows = await this.db
      .select()
      .from(eventSessionsTable)
      .where(
        and(
          eq(eventSessionsTable.organizationId, organizationId),
          eq(eventSessionsTable.eventId, eventId),
        ),
      )
      .orderBy(asc(eventSessionsTable.sessionNumber));
    return rows.map(mapSessionRow);
  }

  async findById(organizationId: string, eventId: string): Promise<EventEntity | null> {
    const rows = await this.db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.organizationId, organizationId), eq(eventsTable.id, eventId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const sessions = await this.loadSessions(organizationId, row.id);
    return mapEventRow(row, sessions);
  }

  async findByPublicCode(publicCode: string): Promise<EventEntity | null> {
    const rows = await this.db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.publicCode, publicCode.trim().toUpperCase()))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const sessions = await this.loadSessions(row.organizationId, row.id);
    return mapEventRow(row, sessions);
  }

  async listByOrganization(organizationId: string, status?: EventStatus): Promise<EventEntity[]> {
    const condition = status
      ? and(eq(eventsTable.organizationId, organizationId), eq(eventsTable.status, status))
      : eq(eventsTable.organizationId, organizationId);

    const rows = await this.db
      .select()
      .from(eventsTable)
      .where(condition)
      .orderBy(desc(eventsTable.startsAt));

    const results: EventEntity[] = [];
    for (const row of rows) {
      const sessions = await this.loadSessions(organizationId, row.id);
      results.push(mapEventRow(row, sessions));
    }
    return results;
  }

  async findScheduledToOpen(now: Date): Promise<EventEntity[]> {
    const rows = await this.db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.status, 'scheduled'), lte(eventsTable.checkinOpensAt, now)));

    const results: EventEntity[] = [];
    for (const row of rows) {
      const sessions = await this.loadSessions(row.organizationId, row.id);
      results.push(mapEventRow(row, sessions));
    }
    return results;
  }

  async findOpenToClose(now: Date): Promise<EventEntity[]> {
    const rows = await this.db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.status, 'open'), lte(eventsTable.checkinClosesAt, now)));

    const results: EventEntity[] = [];
    for (const row of rows) {
      const sessions = await this.loadSessions(row.organizationId, row.id);
      results.push(mapEventRow(row, sessions));
    }
    return results;
  }

  async create(event: EventEntity): Promise<void> {
    await this.db.insert(eventsTable).values({
      id: event.id,
      organizationId: event.organizationId,
      siteId: event.siteId,
      name: event.name,
      description: event.description,
      type: event.type,
      status: event.status,
      publicCode: event.publicCode,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      checkinOpensAt: event.checkinOpensAt,
      checkinClosesAt: event.checkinClosesAt,
      capacity: event.capacity,
      allowedIdentificationModes: [...event.allowedIdentificationModes],
      confirmIdentity: event.confirmIdentity,
      allowWalkIn: event.allowWalkIn,
      certificateRule: { ...event.certificateRule },
      autoIssueCertificates: event.autoIssueCertificates,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    });

    if (event.sessions.length > 0) {
      await this.db.insert(eventSessionsTable).values(
        event.sessions.map((s) => ({
          id: s.id,
          organizationId: s.organizationId,
          eventId: s.eventId,
          sessionNumber: s.sessionNumber,
          title: s.title,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          createdAt: s.createdAt,
        })),
      );
    }
  }

  async update(event: EventEntity): Promise<void> {
    await this.db
      .update(eventsTable)
      .set({
        siteId: event.siteId,
        name: event.name,
        description: event.description,
        status: event.status,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        checkinOpensAt: event.checkinOpensAt,
        checkinClosesAt: event.checkinClosesAt,
        capacity: event.capacity,
        allowedIdentificationModes: [...event.allowedIdentificationModes],
        confirmIdentity: event.confirmIdentity,
        allowWalkIn: event.allowWalkIn,
        certificateRule: { ...event.certificateRule },
        autoIssueCertificates: event.autoIssueCertificates,
        updatedAt: event.updatedAt,
      })
      .where(
        and(eq(eventsTable.organizationId, event.organizationId), eq(eventsTable.id, event.id)),
      );

    await this.db
      .delete(eventSessionsTable)
      .where(
        and(
          eq(eventSessionsTable.organizationId, event.organizationId),
          eq(eventSessionsTable.eventId, event.id),
        ),
      );

    if (event.sessions.length > 0) {
      await this.db.insert(eventSessionsTable).values(
        event.sessions.map((s) => ({
          id: s.id,
          organizationId: s.organizationId,
          eventId: s.eventId,
          sessionNumber: s.sessionNumber,
          title: s.title,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          createdAt: s.createdAt,
        })),
      );
    }
  }
}

export class InMemoryEventsRepository implements EventsRepository {
  private readonly events = new Map<string, EventEntity>();

  async findById(organizationId: string, eventId: string): Promise<EventEntity | null> {
    const event = this.events.get(eventId);
    if (!event || event.organizationId !== organizationId) return null;
    return event;
  }

  async findByPublicCode(publicCode: string): Promise<EventEntity | null> {
    const normalized = publicCode.trim().toUpperCase();
    for (const event of this.events.values()) {
      if (event.publicCode === normalized) return event;
    }
    return null;
  }

  async listByOrganization(organizationId: string, status?: EventStatus): Promise<EventEntity[]> {
    return [...this.events.values()]
      .filter((e) => {
        if (e.organizationId !== organizationId) return false;
        if (status && e.status !== status) return false;
        return true;
      })
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  }

  async findScheduledToOpen(now: Date): Promise<EventEntity[]> {
    return [...this.events.values()].filter(
      (e) => e.status === 'scheduled' && e.checkinOpensAt.getTime() <= now.getTime(),
    );
  }

  async findOpenToClose(now: Date): Promise<EventEntity[]> {
    return [...this.events.values()].filter(
      (e) => e.status === 'open' && e.checkinClosesAt.getTime() <= now.getTime(),
    );
  }

  async create(event: EventEntity): Promise<void> {
    this.events.set(event.id, event);
  }

  async update(event: EventEntity): Promise<void> {
    this.events.set(event.id, event);
  }
}
