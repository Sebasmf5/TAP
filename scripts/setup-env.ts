import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readEnvFile } from './lib/env-file.ts';
import { fillTemplate } from './lib/secrets-gen.ts';

const root = resolve(import.meta.dirname, '..');
const examplePath = resolve(root, '.env.example');
const envPath = resolve(root, '.env');

const template = readFileSync(examplePath, 'utf8');
const existing = new Map(readEnvFile(envPath).map((entry) => [entry.key, entry.value]));
const existed = existsSync(envPath);

const { content, generatedKeys } = fillTemplate(template, existing);

// Conserva las variables propias del desarrollador que no están en la plantilla.
const templateKeys = new Set(readEnvFile(examplePath).map((entry) => entry.key));
const extras = [...existing.entries()].filter(([key]) => !templateKeys.has(key));
const extraBlock = extras.length
  ? `\n# Variables locales no presentes en .env.example\n${extras.map(([k, v]) => `${k}=${v}`).join('\n')}\n`
  : '';

writeFileSync(envPath, content + extraBlock, { encoding: 'utf8', mode: 0o600 });

console.log(existed ? '.env actualizado.' : '.env creado a partir de .env.example.');
console.log(
  generatedKeys.length
    ? `Valores generados (solo nombres): ${generatedKeys.join(', ')}`
    : 'No fue necesario generar valores nuevos.',
);
