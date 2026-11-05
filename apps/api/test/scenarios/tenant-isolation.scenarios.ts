import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app/server.ts';
import { ForbiddenError } from '../../src/shared/index.ts';

import { createHarness, disposeAllHarnesses, type HarnessMode } from '../support/harness.ts';

export function tenantIsolationScenarios(mode: HarnessMode): void {
  describe(`Aislamiento multi-tenant y FeatureGate (AGENTS.md A5.7, B3.2) [${mode}]`, () => {
    afterEach(disposeAllHarnesses);

    it('impide que un usuario de la Entidad A lea o modifique usuarios, sedes o ajustes de la Entidad B', async () => {
      const { container, adminPassword } = await createHarness(mode);
      await container.seedInitialData();
      const server = await buildServer(container);

      // 1. platform_admin inicia sesión y crea dos entidades independientes (Entidad A y Entidad B)
      const platformLogin = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'plataforma@demo.tap', password: adminPassword },
      });
      expect(platformLogin.statusCode).toBe(200);
      const platformToken: string = platformLogin.json().accessToken;

      const orgARes = await server.inject({
        method: 'POST',
        url: '/api/v1/platform/organizations',
        headers: { authorization: `Bearer ${platformToken}` },
        payload: {
          name: 'Instituto Municipal del Deporte (Entidad A)',
          slug: 'inder-municipal',
          type: 'ente_deportivo',
          plan: 'pilot',
          features: {
            attendance: true,
            certificates: true,
            loans: false,
            inventory: false,
            reports: true,
            kioskMode: true,
            googleSso: false,
          },
          allowedEmailDomains: ['inder.gov.co'],
          retentionDays: 730,
        },
      });
      expect(orgARes.statusCode).toBe(201);
      const orgA = orgARes.json();

      const orgBRes = await server.inject({
        method: 'POST',
        url: '/api/v1/platform/organizations',
        headers: { authorization: `Bearer ${platformToken}` },
        payload: {
          name: 'Caja de Compensación Familiar (Entidad B)',
          slug: 'caja-compensacion',
          type: 'caja',
          plan: 'institutional',
          allowedEmailDomains: ['caja.org.co'],
          retentionDays: 1095,
        },
      });
      expect(orgBRes.statusCode).toBe(201);
      const orgB = orgBRes.json();

      // 2. Sembramos un org_admin para la Entidad A y otro para la Entidad B
      const passA = `AdminEntidadA#${randomBytes(6).toString('hex')}`;
      const passB = `AdminEntidadB#${randomBytes(6).toString('hex')}`;

      const userA = await container.accessModule.service.seedStaffUser({
        organizationId: orgA.id,
        email: 'coord@inder.gov.co',
        fullName: 'Coordinadora Inder (A)',
        password: passA,
        role: 'org_admin',
      });

      const userB = await container.accessModule.service.seedStaffUser({
        organizationId: orgB.id,
        email: 'coord@caja.org.co',
        fullName: 'Coordinador Caja (B)',
        password: passB,
        role: 'org_admin',
      });

      const loginA = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: userA.email, password: passA },
      });
      const tokenA: string = loginA.json().accessToken;

      const loginB = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: userB.email, password: passB },
      });
      const tokenB: string = loginB.json().accessToken;

      // 3. Entidad B crea una sede y un usuario operador
      const siteBRes = await server.inject({
        method: 'POST',
        url: '/api/v1/sites',
        headers: { authorization: `Bearer ${tokenB}` },
        payload: {
          name: 'Sede Recreacional Norte (B)',
          code: 'NORTE-B1',
          location: 'Av. Principal #45',
        },
      });
      expect(siteBRes.statusCode).toBe(201);
      const siteB = siteBRes.json();
      expect(siteB.loanPointCode).toHaveLength(8);

      const operatorBRes = await server.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${tokenB}` },
        payload: {
          email: 'operador@caja.org.co',
          fullName: 'Operador Caja B',
          role: 'operator',
          password: `ClaveFuerteCajaB#${randomBytes(6).toString('hex')}`,
        },
      });
      expect(operatorBRes.statusCode).toBe(201);
      const operatorB = operatorBRes.json();

      // 4. Usuario de la Entidad A consulta sus usuarios y sedes: jamás ve datos de la Entidad B
      const listUsersA = await server.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(listUsersA.statusCode).toBe(200);
      const usersInA: Array<{ id: string; organizationId: string }> = listUsersA.json();
      expect(usersInA.every((u) => u.organizationId === orgA.id)).toBe(true);
      expect(usersInA.some((u) => u.id === operatorB.id || u.id === userB.id)).toBe(false);

      const listSitesA = await server.inject({
        method: 'GET',
        url: '/api/v1/sites',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(listSitesA.statusCode).toBe(200);
      expect(listSitesA.json()).toEqual([]);

      // 5. Usuario de la Entidad A intenta modificar o deshabilitar el usuario o la sede de la Entidad B -> 404
      const crossUpdateUser = await server.inject({
        method: 'PATCH',
        url: `/api/v1/users/${operatorB.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { role: 'viewer' },
      });
      expect(crossUpdateUser.statusCode).toBe(404);

      const crossDisableUser = await server.inject({
        method: 'POST',
        url: `/api/v1/users/${operatorB.id}/disable`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(crossDisableUser.statusCode).toBe(404);

      const crossUpdateSite = await server.inject({
        method: 'PATCH',
        url: `/api/v1/sites/${siteB.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { name: 'Intento de intrusión desde A' },
      });
      expect(crossUpdateSite.statusCode).toBe(404);

      // 6. Un org_admin no puede acceder a las rutas exclusivas de platform_admin -> 403
      const forbiddenPlatform = await server.inject({
        method: 'GET',
        url: '/api/v1/platform/organizations',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(forbiddenPlatform.statusCode).toBe(403);

      // 7. Restricción de dominios permitidos para alta de usuarios en Entidad A ('inder.gov.co')
      const wrongDomainUser = await server.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          email: 'externo@gmail.com',
          fullName: 'Usuario Externo',
          role: 'operator',
          password: `ClaveFuerteExterna#${randomBytes(6).toString('hex')}`,
        },
      });
      expect(wrongDomainUser.statusCode).toBe(400);
      expect(wrongDomainUser.json().code).toBe('VALIDATION_ERROR');

      // 8. FeatureGate bloquea préstamos en Entidad A (plan básico con loans: false) y lo permite en Entidad B
      await expect(
        container.organizationsModule.requireFeature(orgA.id, 'loans'),
      ).rejects.toBeInstanceOf(ForbiddenError);

      await expect(
        container.organizationsModule.requireFeature(orgB.id, 'loans'),
      ).resolves.toBeUndefined();

      await server.close();
    });
  });
}
