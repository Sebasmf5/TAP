import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { envKeys, hasPlaceholder, readEnvFile } from './lib/env-file.ts';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');

if (!existsSync(envPath)) {
  console.error('No existe .env. Ejecuta: pnpm setup:env');
  process.exit(1);
}

const expected = envKeys(readEnvFile(resolve(root, '.env.example')));
const actualEntries = readEnvFile(envPath);
const actual = envKeys(actualEntries);

const missing = [...expected].filter((key) => !actual.has(key));
const extra = [...actual].filter((key) => !expected.has(key));
const unfilled = actualEntries.filter((e) => hasPlaceholder(e.value)).map((e) => e.key);

if (extra.length)
  console.warn(`Variables en .env que no están en .env.example: ${extra.join(', ')}`);
if (unfilled.length) console.error(`Variables con marcador sin generar: ${unfilled.join(', ')}`);
if (missing.length) console.error(`Faltan en .env: ${missing.join(', ')}`);

if (missing.length || unfilled.length) process.exit(1);
console.log(
  `.env completo: ${expected.size} variables esperadas presentes (no se muestran valores).`,
);
