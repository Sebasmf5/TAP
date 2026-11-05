import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app/server.ts';
import { REFRESH_COOKIE_NAME, type GoogleOAuthClient } from '../../src/modules/access/index.ts';
import { DEFAULT_FEATURE_FLAGS } from '../../src/modules/organizations/index.ts';
import { createHarness, disposeAllHarnesses, type HarnessMode } from '../support/harness.ts';

interface FakeGoogleProfile {
  readonly sub: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
}

function createFakeGoogleClient(profiles: Record<string, FakeGoogleProfile>): GoogleOAuthClient {
  return {
    isConfigured: () => true,
    buildAuthorizationUrl: (state) => `https://accounts.example.test/auth?state=${state}`,
    async exchangeCodeForUser(code) {
      const profile = profiles[code];
      if (!profile) throw new Error('Código de prueba desconocido');
      return profile;
    },
  };
}

function cookiePair(setCookie: string | string[] | undefined, name: string): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const found = list.find((c) => c.startsWith(`${name}=`));
  return found ? (found.split(';')[0] ?? '') : '';
}

export function googleLoginScenarios(mode: HarnessMode): void {
  describe(`Login con Google respeta los dominios de correo por entidad (AGENTS.md A7.1) [${mode}]`, () => {
    afterEach(disposeAllHarnesses);

    it('permite el dominio autorizado y rechaza dominio no autorizado y correo sin verificar', async () => {
      const googleClient = createFakeGoogleClient({
        'codigo-valido': {
          sub: 'google-sub-valido',
          email: 'coord@inder.gov.co',
          name: 'Coordinadora Inder',
          emailVerified: true,
        },
        'codigo-dominio-ajeno': {
          sub: 'google-sub-ajeno',
          email: 'externo@gmail.com',
          name: 'Persona Externa',
          emailVerified: true,
        },
        'codigo-sin-verificar': {
          sub: 'google-sub-sin-verificar',
          email: 'coord@inder.gov.co',
          name: 'Coordinadora Inder',
          emailVerified: false,
        },
      });

      const harness = await createHarness(mode, { googleClient });
      const { container, clock, adminPassword } = harness;
      await container.seedInitialData();
      const server = await buildServer(container);

      const orgId = container.idGenerator.nextId();
      await container.organizationsModule.repository.create({
        id: orgId,
        name: 'Instituto Municipal del Deporte',
        slug: 'inder-google',
        type: 'ente_deportivo',
        plan: 'institutional',
        features: { ...DEFAULT_FEATURE_FLAGS, googleSso: true },
        logoUrl: null,
        timezone: 'America/Bogota',
        allowedEmailDomains: ['inder.gov.co'],
        dataConsentVersion: 'v1.0',
        dataConsentText: 'Autorización de prueba',
        retentionDays: 365,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      });

      // Ambos usuarios existen y están activos; solo el dominio decide el acceso.
      await container.accessModule.service.seedStaffUser({
        organizationId: orgId,
        email: 'coord@inder.gov.co',
        fullName: 'Coordinadora Inder',
        password: adminPassword,
        role: 'org_admin',
      });
      await container.accessModule.service.seedStaffUser({
        organizationId: orgId,
        email: 'externo@gmail.com',
        fullName: 'Persona Externa',
        password: adminPassword,
        role: 'operator',
      });

      async function runCallback(code: string) {
        const start = await server.inject({ method: 'GET', url: '/api/v1/auth/google' });
        expect(start.statusCode).toBe(200);
        const rawCookie = start.headers['set-cookie'];
        const stateCookie = (Array.isArray(rawCookie) ? rawCookie : [String(rawCookie)])
          .map((c) => c.split(';')[0] ?? '')
          .find((c) => c.length > 0 && !c.startsWith(`${REFRESH_COOKIE_NAME}=`));
        expect(stateCookie).toBeTruthy();
        const [cookieName, ...valueParts] = (stateCookie ?? '').split('=');
        const state = valueParts.join('=');

        return server.inject({
          method: 'GET',
          url: `/api/v1/auth/google/callback?code=${code}&state=${state}`,
          cookies: { [cookieName ?? '']: state },
        });
      }

      // 1. Dominio autorizado: redirige al panel y emite la cookie de refresco propia.
      const allowed = await runCallback('codigo-valido');
      expect(allowed.statusCode).toBe(302);
      expect(allowed.headers['location']).toContain('/app');
      expect(cookiePair(allowed.headers['set-cookie'], REFRESH_COOKIE_NAME)).not.toBe('');

      // 2. Dominio no autorizado por la entidad: 403 y sin cookie de sesión.
      const blocked = await runCallback('codigo-dominio-ajeno');
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().code).toBe('FORBIDDEN');
      expect(cookiePair(blocked.headers['set-cookie'], REFRESH_COOKIE_NAME)).toBe('');

      // 3. Correo de Google sin verificar: 401 aunque el dominio sea válido.
      const unverified = await runCallback('codigo-sin-verificar');
      expect(unverified.statusCode).toBe(401);

      await server.close();
    });
  });
}
