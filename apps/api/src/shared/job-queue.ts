import { PgBoss, type Job } from 'pg-boss';
import type { Logger } from 'pino';

export interface EnqueueJobOptions {
  singletonKey?: string;
  startAfterSeconds?: number;
  retryLimit?: number;
  retryDelaySeconds?: number;
}

export interface JobContext<TPayload> {
  readonly id: string;
  readonly name: string;
  readonly data: TPayload;
  readonly retryCount: number;
}

export type JobHandler<TPayload> = (job: JobContext<TPayload>) => Promise<void>;

export interface JobWorkerOptions {
  concurrency?: number;
}

export interface JobQueue {
  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
  enqueue<TPayload extends object>(
    queueName: string,
    payload: TPayload,
    options?: EnqueueJobOptions,
  ): Promise<string | null>;
  registerWorker<TPayload extends object>(
    queueName: string,
    handler: JobHandler<TPayload>,
    options?: JobWorkerOptions,
  ): Promise<void>;
  scheduleCron<TPayload extends object>(
    queueName: string,
    cronExpression: string,
    payload: TPayload,
  ): Promise<void>;
}

export class PgBossJobQueue implements JobQueue {
  private readonly boss: PgBoss;
  private readonly logger: Logger;
  private readonly knownQueues = new Set<string>();
  private started = false;

  constructor(params: { connectionString: string; schema?: string; logger: Logger }) {
    this.logger = params.logger;
    this.boss = new PgBoss({
      connectionString: params.connectionString,
      schema: params.schema ?? 'pgboss',
      max: 4,
    });
    this.boss.on('error', (err) => {
      this.logger.error({ err }, 'Error en la cola de trabajos pg-boss');
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.boss.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.boss.stop({ graceful: true, timeout: 5000 });
    this.started = false;
  }

  isReady(): boolean {
    return this.started;
  }

  private async ensureQueue(queueName: string): Promise<void> {
    if (this.knownQueues.has(queueName)) return;
    const existing = await this.boss.getQueue(queueName);
    if (!existing) {
      await this.boss.createQueue(queueName);
    }
    this.knownQueues.add(queueName);
  }

  async enqueue<TPayload extends object>(
    queueName: string,
    payload: TPayload,
    options?: EnqueueJobOptions,
  ): Promise<string | null> {
    await this.ensureQueue(queueName);
    return this.boss.send(queueName, payload, {
      ...(options?.singletonKey ? { singletonKey: options.singletonKey } : {}),
      ...(options?.startAfterSeconds !== undefined
        ? { startAfter: options.startAfterSeconds }
        : {}),
      ...(options?.retryLimit !== undefined ? { retryLimit: options.retryLimit } : {}),
      ...(options?.retryDelaySeconds !== undefined
        ? { retryDelay: options.retryDelaySeconds }
        : {}),
    });
  }

  async registerWorker<TPayload extends object>(
    queueName: string,
    handler: JobHandler<TPayload>,
    options?: JobWorkerOptions,
  ): Promise<void> {
    await this.ensureQueue(queueName);
    await this.boss.work<TPayload>(
      queueName,
      { localConcurrency: options?.concurrency ?? 1 },
      async (jobs: Job<TPayload>[]) => {
        for (const job of jobs) {
          await handler({
            id: job.id,
            name: job.name,
            data: job.data,
            retryCount: job.retryCount,
          });
        }
      },
    );
  }

  async scheduleCron<TPayload extends object>(
    queueName: string,
    cronExpression: string,
    payload: TPayload,
  ): Promise<void> {
    await this.ensureQueue(queueName);
    await this.boss.schedule(queueName, cronExpression, payload, {
      tz: 'America/Bogota',
    });
  }
}

export class InMemoryJobQueue implements JobQueue {
  private ready = false;
  private seq = 0;
  private readonly workers = new Map<string, JobHandler<object>>();
  public readonly enqueued: Array<{
    id: string;
    queueName: string;
    payload: object;
    options?: EnqueueJobOptions;
  }> = [];

  async start(): Promise<void> {
    this.ready = true;
  }

  async stop(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async enqueue<TPayload extends object>(
    queueName: string,
    payload: TPayload,
    options?: EnqueueJobOptions,
  ): Promise<string | null> {
    if (
      options?.singletonKey &&
      this.enqueued.some(
        (item) =>
          item.queueName === queueName && item.options?.singletonKey === options.singletonKey,
      )
    ) {
      return null;
    }
    const id = `job-${++this.seq}`;
    this.enqueued.push({ id, queueName, payload, options });
    const worker = this.workers.get(queueName);
    if (worker) {
      await worker({ id, name: queueName, data: payload, retryCount: 0 });
    }
    return id;
  }

  async registerWorker<TPayload extends object>(
    queueName: string,
    handler: JobHandler<TPayload>,
  ): Promise<void> {
    this.workers.set(queueName, handler as JobHandler<object>);
  }

  async scheduleCron(): Promise<void> {
    // En memoria no requiere planificador activo.
  }
}
