import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { DrizzleExecutor } from '../../shared/index.ts';

export interface DatabaseConnection {
  readonly pool: pg.Pool;
  readonly db: DrizzleExecutor;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createDatabaseConnection(connectionString: string): DatabaseConnection {
  const pool = new pg.Pool({
    connectionString,
    // Pool dimensionado para la ruta caliente sin agotar las conexiones de Postgres.
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  const db = drizzle(pool);

  return {
    pool,
    db,
    async ping(): Promise<boolean> {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
