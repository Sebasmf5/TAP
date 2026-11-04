import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Enmascara un documento o identificador sensible dejando solo los últimos 4 caracteres (Ley 1581, AGENTS.md A7.4).
 */
export function maskDocument(value: string): string {
  const clean = value.trim();
  if (clean.length <= 4) return '••••';
  return `•••${clean.slice(-4)}`;
}

export function buildLoggerOptions(level: string): LoggerOptions {
  return {
    level,
    // Evita que cabeceras, cookies, tokens o contraseñas lleguen a los logs.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.refreshToken',
        '*.secret',
        '*.documentNumber',
      ],
      censor: '[REDACTED]',
    },
  };
}

export function createLogger(level = 'info'): Logger {
  return pino(buildLoggerOptions(level));
}
