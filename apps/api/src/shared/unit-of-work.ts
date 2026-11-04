import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent, EventBus } from './event-bus.ts';

export type DrizzleExecutor = NodePgDatabase<Record<string, never>>;

/**
 * Contexto transaccional que las fachadas de módulos aceptan opcionalmente (AGENTS.md A5.4, A5.5).
 * Los eventos registrados en `recordEvent` se publican únicamente después de confirmar el commit.
 */
export interface TxContext {
  readonly db: DrizzleExecutor;
  recordEvent(event: DomainEvent): void;
}

export interface UnitOfWork {
  execute<TResult>(work: (tx: TxContext) => Promise<TResult>): Promise<TResult>;
}

export class DrizzleUnitOfWork implements UnitOfWork {
  private readonly db: DrizzleExecutor;
  private readonly eventBus: EventBus;

  constructor(db: DrizzleExecutor, eventBus: EventBus) {
    this.db = db;
    this.eventBus = eventBus;
  }

  async execute<TResult>(work: (tx: TxContext) => Promise<TResult>): Promise<TResult> {
    const stagedEvents: DomainEvent[] = [];
    const result = await this.db.transaction(async (drizzleTx) => {
      const ctx: TxContext = {
        db: drizzleTx as unknown as DrizzleExecutor,
        recordEvent(event: DomainEvent) {
          stagedEvents.push(event);
        },
      };
      return work(ctx);
    });

    if (stagedEvents.length > 0) {
      await this.eventBus.publish(stagedEvents);
    }
    return result;
  }
}
