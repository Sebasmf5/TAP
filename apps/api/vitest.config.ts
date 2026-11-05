import { defineConfig } from 'vitest/config';

// Dos proyectos: «unit» (rápido, repositorios en memoria) e «integration»
// (Postgres real con Testcontainers o TEST_DATABASE_ADMIN_URL).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          testTimeout: 30_000,
          include: ['test/**/*.test.ts'],
          exclude: ['test/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/**/*.integration.test.ts'],
          globalSetup: ['test/support/global-setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
