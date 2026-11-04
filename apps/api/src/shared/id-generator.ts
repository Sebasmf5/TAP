import { randomBytes, randomInt } from 'node:crypto';

/** Alfabeto sin ambigüedades visuales requerido por AGENTS.md A5.8. */
export const PUBLIC_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export interface IdGenerator {
  nextId(): string;
  publicCode(length?: number): string;
}

/**
 * Genera un UUID v7 (RFC 9562) ordenable por tiempo usando fuente criptográfica.
 */
export function generateUuidV7(nowMs: number = Date.now()): string {
  const bytes = randomBytes(16);
  const timestamp = BigInt(nowMs);

  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);

  // Versión 7 (0111) en los 4 bits altos del octeto 6
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  // Variante RFC 4122/9562 (10xx) en los 2 bits altos del octeto 8
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function generatePublicCode(length = 8): string {
  if (!Number.isInteger(length) || length < 4 || length > 64) {
    throw new RangeError('La longitud del código público debe estar entre 4 y 64 caracteres.');
  }
  let code = '';
  for (let i = 0; i < length; i++) {
    const idx = randomInt(0, PUBLIC_CODE_ALPHABET.length);
    code += PUBLIC_CODE_ALPHABET[idx];
  }
  return code;
}

export class CryptoIdGenerator implements IdGenerator {
  nextId(): string {
    return generateUuidV7();
  }

  publicCode(length = 8): string {
    return generatePublicCode(length);
  }
}
