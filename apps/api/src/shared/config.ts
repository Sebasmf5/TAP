import { z } from 'zod';

const nonPlaceholder = (field: string) =>
  z
    .string()
    .min(1, `${field} es obligatorio`)
    .refine(
      (val) => !val.includes('<generado') && !val.includes('<password>'),
      `${field} contiene un marcador sin reemplazar; ejecuta pnpm setup:env`,
    );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((raw) =>
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  POSTGRES_USER: nonPlaceholder('POSTGRES_USER'),
  POSTGRES_PASSWORD: nonPlaceholder('POSTGRES_PASSWORD'),
  POSTGRES_DB: nonPlaceholder('POSTGRES_DB'),
  DATABASE_URL: nonPlaceholder('DATABASE_URL').refine(
    (val) => val.startsWith('postgres://') || val.startsWith('postgresql://'),
    'DATABASE_URL debe iniciar con postgres:// o postgresql://',
  ),

  JWT_ISSUER: nonPlaceholder('JWT_ISSUER'),
  JWT_AUDIENCE: nonPlaceholder('JWT_AUDIENCE'),
  JWT_ACCESS_TTL: z.string().regex(/^\d+[smhd]$/, 'JWT_ACCESS_TTL inválido (ej: 15m)'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  JWT_PRIVATE_KEY: nonPlaceholder('JWT_PRIVATE_KEY'),
  JWT_PUBLIC_KEY: nonPlaceholder('JWT_PUBLIC_KEY'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),

  GOOGLE_OAUTH_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().optional().default(''),

  SMTP_HOST: z.string().min(1).default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM: z.string().min(1),

  STORAGE_DIR: z.string().min(1).default('./storage'),

  SEED_ADMIN_EMAIL: z.email(),
  SEED_ADMIN_PASSWORD: nonPlaceholder('SEED_ADMIN_PASSWORD').refine(
    (val) => val.length >= 12,
    'SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres',
  ),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const normalizedEnv: NodeJS.ProcessEnv = {
    ...env,
    API_PORT: env['API_PORT'] ?? env['PORT'],
    POSTGRES_USER:
      env['POSTGRES_USER'] ?? env['PGUSER'] ?? (env['DATABASE_URL'] ? 'postgres' : undefined),
    POSTGRES_PASSWORD:
      env['POSTGRES_PASSWORD'] ??
      env['PGPASSWORD'] ??
      (env['DATABASE_URL'] ? 'railway-managed' : undefined),
    POSTGRES_DB:
      env['POSTGRES_DB'] ?? env['PGDATABASE'] ?? (env['DATABASE_URL'] ? 'railway' : undefined),
  };
  const parsed = EnvSchema.safeParse(normalizedEnv);
  if (!parsed.success) {
    // Solo reportamos los nombres de las variables inválidas, nunca sus valores.
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuración de entorno inválida: ${issues}`);
  }
  return parsed.data;
}
