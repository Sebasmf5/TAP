import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { readEnvFile } from './lib/env-file.ts';
import {
  checkPublicVars,
  isSensitiveKey,
  scanContent,
  scanForSecretValues,
  type Finding,
} from './lib/bundle-scan.ts';

const root = resolve(import.meta.dirname, '..');
const distDir = resolve(root, 'apps/web/dist');

if (!existsSync(distDir)) {
  console.error(
    'No existe apps/web/dist. Compila el frontend antes (pnpm --filter @tap/web build).',
  );
  process.exit(1);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const exampleEntries = readEnvFile(resolve(root, '.env.example'));
const localEntries = readEnvFile(resolve(root, '.env'));
const serverEnvNames = exampleEntries.map((e) => e.key).filter((k) => !k.startsWith('VITE_'));
const secretValues = localEntries.filter(
  (e) => isSensitiveKey(e.key) && !e.key.startsWith('VITE_'),
);
const processVars = Object.entries(process.env)
  .filter(([key]) => key.startsWith('VITE_'))
  .map(([key, value]) => ({ key, value: value ?? '' }));

const findings: Finding[] = [
  ...checkPublicVars([...exampleEntries, ...localEntries, ...processVars]),
];

const textFiles = listFiles(distDir).filter((f) => /\.(js|mjs|css|html|json|map|txt|svg)$/.test(f));
for (const file of textFiles) {
  const content = readFileSync(file, 'utf8');
  const name = relative(root, file);
  findings.push(...scanContent(name, content, serverEnvNames));
  findings.push(...scanForSecretValues(name, content, secretValues));
}

if (findings.length) {
  console.error('check:bundle FALLÓ. Hallazgos (sin mostrar valores):');
  for (const f of findings) console.error(`  - ${f.file}: ${f.rule}`);
  process.exit(1);
}
console.log(
  `check:bundle OK: ${textFiles.length} archivos del bundle revisados, sin secretos ni variables sensibles.`,
);
