import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PUBLIC_VARS,
  checkPublicVars,
  scanContent,
} from '../../../scripts/lib/bundle-scan.ts';
import { readEnvFile } from '../../../scripts/lib/env-file.ts';

describe('Seguridad de variables públicas del frontend (AGENTS.md A2.4)', () => {
  it('solo permite VITE_API_BASE_URL y VITE_APP_NAME en .env.example', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const entries = readEnvFile(resolve(root, '.env.example'));
    const viteEntries = entries.filter((e) => e.key.startsWith('VITE_'));

    expect(viteEntries.map((e) => e.key).sort()).toEqual([...ALLOWED_PUBLIC_VARS].sort());
    expect(checkPublicVars(viteEntries)).toEqual([]);
  });

  it('rechaza variables VITE_* con nombres o valores con forma de secreto', () => {
    const runtimeSecret = randomBytes(32).toString('base64');
    expect(
      checkPublicVars([{ key: 'VITE_JWT_SECRET', value: runtimeSecret }]).length,
    ).toBeGreaterThan(0);

    expect(checkPublicVars([{ key: 'VITE_API_KEY', value: runtimeSecret }]).length).toBeGreaterThan(
      0,
    );

    expect(
      checkPublicVars([
        {
          key: 'VITE_APP_NAME',
          value: runtimeSecret,
        },
      ]).length,
    ).toBeGreaterThan(0);
  });

  it('detecta claves privadas, URLs de base de datos o variables del servidor en el contenido de un bundle', () => {
    const runtimePass = randomBytes(12).toString('hex');
    const proto = ['postgres', '://'].join('');
    const keyName = ['JWT', 'PRIVATE', 'KEY'].join('_');
    const findings = scanContent(
      'dist/assets/index.js',
      `const db = "${proto}tap_app:${runtimePass}@127.0.0.1:5432/tap"; const k = "${keyName}";`,
      [keyName, 'DATABASE_URL'],
    );
    expect(findings.length).toBeGreaterThanOrEqual(2);

    const cleanCss = readFileSync(
      resolve(import.meta.dirname, '../src/app/theme/tokens.css'),
      'utf8',
    );
    expect(scanContent('tokens.css', cleanCss, [keyName, 'DATABASE_URL'])).toEqual([]);
  });
});
