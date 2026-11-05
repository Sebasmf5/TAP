import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer | undefined;

const existingUrl = process.env['TEST_DATABASE_ADMIN_URL'] ?? process.env['DATABASE_URL'];
if (existingUrl) {
  try {
    const url = new URL(existingUrl);
    process.env['DATABASE_URL'] = existingUrl;
    process.env['POSTGRES_USER'] = process.env['POSTGRES_USER'] ?? url.username ?? 'tap_app';
    process.env['POSTGRES_PASSWORD'] =
      process.env['POSTGRES_PASSWORD'] ?? url.password ?? 'ci_ephemeral_db_password_only';
    process.env['POSTGRES_DB'] =
      process.env['POSTGRES_DB'] ?? url.pathname.replace(/^\//, '') ?? 'tap';
  } catch {
    process.env['DATABASE_URL'] = existingUrl;
    process.env['POSTGRES_USER'] = process.env['POSTGRES_USER'] ?? 'tap_app';
    process.env['POSTGRES_PASSWORD'] =
      process.env['POSTGRES_PASSWORD'] ?? 'ci_ephemeral_db_password_only';
    process.env['POSTGRES_DB'] = process.env['POSTGRES_DB'] ?? 'tap';
  }
} else {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  process.env['DATABASE_URL'] = container.getConnectionUri();
  process.env['POSTGRES_USER'] = container.getUsername();
  process.env['POSTGRES_PASSWORD'] = container.getPassword();
  process.env['POSTGRES_DB'] = container.getDatabase();
}

const cleanup = async () => {
  if (container) {
    try {
      await container.stop();
    } catch {
      // ignore
    }
  }
};

process.on('SIGINT', () => void cleanup().finally(() => process.exit(0)));
process.on('SIGTERM', () => void cleanup().finally(() => process.exit(0)));

await import('../src/main.ts');
