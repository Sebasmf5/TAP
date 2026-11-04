import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/shared/infrastructure/schema.ts', './src/modules/*/infrastructure/schema.ts'],
  out: './drizzle',
  strict: true,
  verbose: true,
});
