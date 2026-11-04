import type { Clock } from './clock.ts';
import type { IdGenerator } from './id-generator.ts';
import { auditLogsTable } from './infrastructure/schema.ts';
import type { DrizzleExecutor } from './unit-of-work.ts';

export interface AuditLogEntryInput {
  readonly organizationId: string | null;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly ipHash?: string | null;
}

export interface AuditLogRecord extends AuditLogEntryInput {
  readonly id: string;
  readonly occurredAt: Date;
}

export interface AuditLog {
  record(entry: AuditLogEntryInput, db?: DrizzleExecutor): Promise<AuditLogRecord>;
}

export class DrizzleAuditLog implements AuditLog {
  private readonly defaultDb: DrizzleExecutor;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;

  constructor(params: { db: DrizzleExecutor; idGenerator: IdGenerator; clock: Clock }) {
    this.defaultDb = params.db;
    this.idGenerator = params.idGenerator;
    this.clock = params.clock;
  }

  async record(entry: AuditLogEntryInput, db?: DrizzleExecutor): Promise<AuditLogRecord> {
    const executor = db ?? this.defaultDb;
    const record: AuditLogRecord = {
      id: this.idGenerator.nextId(),
      occurredAt: this.clock.now(),
      organizationId: entry.organizationId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ?? {},
      ipHash: entry.ipHash ?? null,
    };

    await executor.insert(auditLogsTable).values({
      id: record.id,
      organizationId: record.organizationId,
      actorUserId: record.actorUserId,
      action: record.action,
      targetType: record.targetType,
      targetId: record.targetId,
      metadata: record.metadata ?? {},
      ipHash: record.ipHash ?? null,
      occurredAt: record.occurredAt,
    });

    return record;
  }
}

export class InMemoryAuditLog implements AuditLog {
  public readonly entries: AuditLogRecord[] = [];
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;

  constructor(params: { idGenerator: IdGenerator; clock: Clock }) {
    this.idGenerator = params.idGenerator;
    this.clock = params.clock;
  }

  async record(entry: AuditLogEntryInput): Promise<AuditLogRecord> {
    const record: AuditLogRecord = {
      id: this.idGenerator.nextId(),
      occurredAt: this.clock.now(),
      ...entry,
    };
    this.entries.push(record);
    return record;
  }
}
