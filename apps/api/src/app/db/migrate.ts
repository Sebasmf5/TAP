import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DrizzleExecutor } from '../../shared/index.ts';

function resolveDefaultMigrationsFolder(): string {
  const candidates = [
    resolve(import.meta.dirname, '../drizzle'),
    resolve(import.meta.dirname, '../../../drizzle'),
    resolve(process.cwd(), 'drizzle'),
    resolve(process.cwd(), 'apps/api/drizzle'),
  ];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'meta/_journal.json'))) {
      return candidate;
    }
  }
  return candidates[0] ?? resolve(process.cwd(), 'drizzle');
}

export async function runMigrations(db: DrizzleExecutor, migrationsFolder?: string): Promise<void> {
  const folder = migrationsFolder ?? resolveDefaultMigrationsFolder();
  await migrate(db, { migrationsFolder: folder });
}
