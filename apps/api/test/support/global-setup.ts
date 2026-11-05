import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    adminDatabaseUrl: string;
  }
}

/**
 * Arranca un único Postgres 17 para todas las pruebas de integración.
 * Si existe TEST_DATABASE_ADMIN_URL (por ejemplo, el servicio de la CI) lo usa y no levanta contenedor.
 * Cada prueba crea su propia base de datos aislada dentro de ese servidor.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const externalUrl = process.env['TEST_DATABASE_ADMIN_URL'];
  if (externalUrl) {
    project.provide('adminDatabaseUrl', externalUrl);
    return async () => {};
  }

  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  project.provide('adminDatabaseUrl', container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
