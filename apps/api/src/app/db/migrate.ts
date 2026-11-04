import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import type { DrizzleExecutor } from '../../shared/index.ts';

export async function runMigrations(db: DrizzleExecutor, migrationsFolder?: string): Promise<void> {
  const folder = migrationsFolder ?? resolve(import.meta.dirname, '../../../drizzle');
  await migrate(db, { migrationsFolder: folder });
}
