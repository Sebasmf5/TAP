export interface Finding {
  file: string;
  rule: string;
}

/** Únicas variables públicas que el frontend puede recibir (AGENTS.md A2). */
export const ALLOWED_PUBLIC_VARS = new Set(['VITE_API_BASE_URL', 'VITE_APP_NAME']);

const SENSITIVE_NAME = /(SECRET|PASSWORD|PRIVATE|TOKEN|KEY|CREDENTIAL)/;

const SECRET_SHAPES: ReadonlyArray<{ rule: string; pattern: RegExp }> = [
  { rule: 'encabezado PEM de clave privada', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { rule: 'PEM codificado en base64', pattern: /LS0tLS1CRUdJTi/ },
  { rule: 'clave Ed25519 PKCS8 en base64', pattern: /MC4CAQAwBQYDK2Vw/ },
  { rule: 'JWT incrustado', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./ },
  {
    rule: 'URL de base de datos con credenciales',
    pattern: /postgres(?:ql)?:\/\/[^\s"'`:/]+:[^\s"'`@]+@/,
  },
  { rule: 'secreto de cliente OAuth de Google', pattern: /GOCSPX-[A-Za-z0-9_-]{10,}/ },
  { rule: 'clave de acceso de AWS', pattern: /AKIA[0-9A-Z]{16}/ },
];

/** Nombres de variables de entorno con forma de secreto, en mayúsculas sostenidas. */
const SENSITIVE_ENV_NAME =
  /\b[A-Z][A-Z0-9]*_(?:[A-Z0-9]+_)*(?:SECRET|PASSWORD|PRIVATE_KEY|PUBLIC_KEY|API_KEY|TOKEN)\b/;

export function scanContent(
  file: string,
  content: string,
  serverEnvNames: Iterable<string>,
): Finding[] {
  const findings: Finding[] = [];
  for (const { rule, pattern } of SECRET_SHAPES) {
    if (pattern.test(content)) findings.push({ file, rule });
  }
  const envName = SENSITIVE_ENV_NAME.exec(content);
  if (envName) findings.push({ file, rule: `nombre de variable sensible (${envName[0]})` });
  for (const name of serverEnvNames) {
    if (!name.startsWith('VITE_') && content.includes(name)) {
      findings.push({ file, rule: `nombre de variable del servidor (${name})` });
    }
  }
  return findings;
}

/** Busca valores reales de secretos del servidor dentro del bundle; reporta solo el nombre. */
export function scanForSecretValues(
  file: string,
  content: string,
  secrets: ReadonlyArray<{ key: string; value: string }>,
): Finding[] {
  return secrets
    .filter(({ value }) => value.length >= 8 && content.includes(value))
    .map(({ key }) => ({ file, rule: `valor real de ${key}` }));
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_NAME.test(key) || key === 'DATABASE_URL' || key === 'SMTP_USER';
}

export function checkPublicVars(vars: ReadonlyArray<{ key: string; value: string }>): Finding[] {
  const findings: Finding[] = [];
  for (const { key, value } of vars) {
    if (!key.startsWith('VITE_')) continue;
    const where = `variable ${key}`;
    if (SENSITIVE_NAME.test(key.slice('VITE_'.length))) {
      findings.push({ file: where, rule: 'nombre sensible en variable pública' });
    }
    if (!ALLOWED_PUBLIC_VARS.has(key)) {
      findings.push({ file: where, rule: 'variable pública no autorizada' });
    }
    for (const { rule, pattern } of SECRET_SHAPES) {
      if (pattern.test(value)) findings.push({ file: where, rule });
    }
    if (/^[A-Za-z0-9+/_-]{32,}={0,2}$/.test(value)) {
      findings.push({ file: where, rule: 'valor con forma de clave' });
    }
  }
  return findings;
}
