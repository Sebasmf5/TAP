import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const config = resolve(root, '.gitleaks.toml');

function findWingetGitleaks(): string | undefined {
  const localAppData = process.env['LOCALAPPDATA'];
  if (!localAppData) return undefined;
  const pkgsDir = join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (!existsSync(pkgsDir)) return undefined;
  for (const entry of readdirSync(pkgsDir)) {
    if (entry.startsWith('Gitleaks.Gitleaks')) {
      const candidate = join(pkgsDir, entry, 'gitleaks.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function findGitleaks(): string | undefined {
  const candidates = [process.env['GITLEAKS_BIN'], 'gitleaks', findWingetGitleaks()].filter(
    (c): c is string => typeof c === 'string' && c.length > 0,
  );
  return candidates.find((bin) => spawnSync(bin, ['version'], { stdio: 'ignore' }).status === 0);
}

const bin = findGitleaks();
if (!bin) {
  console.error(
    [
      'No se encontró gitleaks. Instálalo y vuelve a ejecutar:',
      '  Windows: winget install Gitleaks.Gitleaks',
      '  macOS:   brew install gitleaks',
      '  Linux:   https://github.com/gitleaks/gitleaks/releases',
      'O define GITLEAKS_BIN con la ruta al ejecutable.',
    ].join('\n'),
  );
  process.exit(1);
}

// --redact evita que un hallazgo imprima el secreto en la consola o en CI.
const common = ['--config', config, '--redact', '--no-banner', '--exit-code', '1'];
const scans: ReadonlyArray<{ label: string; args: string[] }> = [
  { label: 'árbol de trabajo', args: ['dir', root, ...common] },
  { label: 'área de preparación', args: ['git', root, '--pre-commit', '--staged', ...common] },
];

let failed = false;
for (const { label, args } of scans) {
  const result = spawnSync(bin, args, { stdio: 'inherit', cwd: root });
  const ok = result.status === 0;
  console.log(`check:secrets [${label}]: ${ok ? 'sin hallazgos' : 'HALLAZGOS O ERROR'}`);
  failed ||= !ok;
}
process.exit(failed ? 1 : 0);
