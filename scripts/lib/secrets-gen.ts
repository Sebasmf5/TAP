import { randomBytes, generateKeyPairSync } from 'node:crypto';

export type Generated = Record<string, string>;

export function generatePassword(): string {
  // base64url evita caracteres que romperían DATABASE_URL o el .env
  return randomBytes(24).toString('base64url');
}

export function generateJwtKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return {
    privateKey: Buffer.from(privateKey).toString('base64'),
    publicKey: Buffer.from(publicKey).toString('base64'),
  };
}

/**
 * Sustituye los marcadores de `.env.example` por valores generados.
 * Devuelve el contenido nuevo y los nombres de las variables generadas (nunca sus valores).
 */
export function fillTemplate(
  template: string,
  existing: ReadonlyMap<string, string>,
): { content: string; generatedKeys: string[] } {
  const generated = new Map<string, string>();
  const jwt = generateJwtKeyPair();
  const generators: Record<string, () => string> = {
    POSTGRES_PASSWORD: generatePassword,
    POSTGRES_ADMIN_PASSWORD: generatePassword,
    SEED_ADMIN_PASSWORD: generatePassword,
    JWT_PRIVATE_KEY: () => jwt.privateKey,
    JWT_PUBLIC_KEY: () => jwt.publicKey,
  };

  const resolve = (key: string, templateValue: string): string => {
    const current = existing.get(key);
    if (current !== undefined && !current.includes('<')) return current;
    const generator = generators[key];
    if (templateValue.includes('<generado') && generator) {
      const value = generator();
      generated.set(key, value);
      return value;
    }
    return templateValue;
  };

  const lines = template.split(/\r?\n/).map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match?.[1] || match[2] === undefined) return line;
    return `${match[1]}=${resolve(match[1], match[2])}`;
  });

  const content = lines.join('\n').replace(/^DATABASE_URL=(.*)$/m, (whole, url: string) => {
    if (!url.includes('<password>')) return whole;
    const password = generated.get('POSTGRES_PASSWORD') ?? existing.get('POSTGRES_PASSWORD');
    if (!password) return whole;
    generated.set('DATABASE_URL', '');
    return `DATABASE_URL=${url.replace('<password>', password)}`;
  });

  return { content, generatedKeys: [...generated.keys()] };
}
