export interface DomainEvent<TName extends string = string, TPayload = unknown> {
  readonly id: string;
  readonly name: TName;
  readonly occurredAt: Date;
  readonly organizationId: string | null;
  readonly payload: TPayload;
}

export type DomainEventHandler<TPayload = unknown> = (
  event: DomainEvent<string, TPayload>,
) => Promise<void> | void;

export interface EventBus {
  subscribe<TPayload = unknown>(
    eventName: string,
    handler: DomainEventHandler<TPayload>,
  ): () => void;
  publish(events: DomainEvent | ReadonlyArray<DomainEvent>): Promise<void>;
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<DomainEventHandler<unknown>>>();

  subscribe<TPayload = unknown>(
    eventName: string,
    handler: DomainEventHandler<TPayload>,
  ): () => void {
    const existing = this.handlers.get(eventName) ?? new Set<DomainEventHandler<unknown>>();
    const typedHandler = handler as DomainEventHandler<unknown>;
    existing.add(typedHandler);
    this.handlers.set(eventName, existing);
    return () => {
      existing.delete(typedHandler);
    };
  }

  async publish(events: DomainEvent | ReadonlyArray<DomainEvent>): Promise<void> {
    const list = Array.isArray(events) ? events : [events];
    for (const event of list) {
      const subscribers = this.handlers.get(event.name);
      if (!subscribers || subscribers.size === 0) continue;
      for (const handler of subscribers) {
        await handler(event);
      }
    }
  }
}
