import { defineConfig, devices } from '@playwright/test';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const e2eAdminPassword =
  process.env['E2E_ADMIN_PASSWORD'] ?? `ClaveE2ESegura#${randomBytes(6).toString('hex')}`;
process.env['E2E_ADMIN_PASSWORD'] = e2eAdminPassword;

const e2eDbPass = randomBytes(16).toString('hex');
const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node apps/api/src/main.ts',
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: !process.env['CI'],
      env: {
        NODE_ENV: 'development',
        TAP_IN_MEMORY: 'true',
        APP_URL: 'http://127.0.0.1:5173',
        API_HOST: '127.0.0.1',
        API_PORT: '3000',
        CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:5173,http://localhost:5173',
        LOG_LEVEL: 'warn',
        POSTGRES_USER: 'tap_app',
        POSTGRES_PASSWORD: e2eDbPass,
        POSTGRES_DB: 'tap',
        DATABASE_URL: `postgres://tap_app:${e2eDbPass}@127.0.0.1:5432/tap`,
        JWT_ISSUER: 'tap-api',
        JWT_AUDIENCE: 'tap-web',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL_DAYS: '7',
        JWT_PRIVATE_KEY: Buffer.from(privateKey, 'utf8').toString('base64'),
        JWT_PUBLIC_KEY: Buffer.from(publicKey, 'utf8').toString('base64'),
        COOKIE_SECURE: 'false',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        SMTP_FROM: 'Tap <no-reply@tap.local>',
        STORAGE_DIR: './storage',
        SEED_ADMIN_EMAIL: 'admin@demo.tap',
        SEED_ADMIN_PASSWORD: e2eAdminPassword,
      },
    },
    {
      command: 'pnpm --filter @tap/web dev --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173/login',
      reuseExistingServer: !process.env['CI'],
    },
  ],
});
