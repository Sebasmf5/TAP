import { readFileSync, existsSync } from 'node:fs';

export interface EnvEntry {
  key: string;
  value: string;
}

const LINE_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

export function parseEnv(content: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = LINE_PATTERN.exec(line);
    if (!match || line.trimStart().startsWith('#')) continue;
    const [, key, rawValue] = match;
    if (key === undefined || rawValue === undefined) continue;
    entries.push({ key, value: unquote(rawValue.trim()) });
  }
  return entries;
}

function unquote(value: string): string {
  const quoted = /^(['"])(.*)\1$/.exec(value);
  return quoted?.[2] ?? value;
}

export function readEnvFile(path: string): EnvEntry[] {
  if (!existsSync(path)) return [];
  return parseEnv(readFileSync(path, 'utf8'));
}

export function envKeys(entries: EnvEntry[]): Set<string> {
  return new Set(entries.map((entry) => entry.key));
}

export const PLACEHOLDER_MARK = '<generado por pnpm setup:env>';

export function hasPlaceholder(value: string): boolean {
  return value.includes(PLACEHOLDER_MARK) || value.includes('<password>');
}
