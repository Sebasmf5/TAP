import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};
const external = Object.keys(pkg.dependencies ?? {});

await build({
  entryPoints: [resolve(root, 'src/main.ts')],
  outfile: resolve(root, 'dist/main.js'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external,
});
