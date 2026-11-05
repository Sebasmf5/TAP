import type {
  DashboardSummaryResponse,
  InventoryUnitDto,
  LoanDto,
  OverdueSweepResponse,
  PublicLendingPointInfo,
} from '@tap/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app/server.ts';
import {
  DefaultBorrowerEligibilityStrategy,
  StandardLoanDurationPolicyStrategy,
  assertValidLoanTransition,
} from '../../src/modules/loans/index.ts';
import { DEFAULT_FEATURE_FLAGS } from '../../src/modules/organizations/index.ts';
import { createHarness, disposeAllHarnesses, type HarnessMode } from '../support/harness.ts';

export function defineLoansAndReportsScenarios(mode: HarnessMode): void {
  afterEach(async () => {
    await disposeAllHarnesses();
  });

  describe(`Módulos inventory, loans y reports: reserva atómica, firma, mora, reportes y aislamiento (Fases 5 y 6) [${mode}]`, () => {
    it('aplica estrategias de plazo y bloqueo por mora y valida transiciones del préstamo', () => {
      const eligibility = new DefaultBorrowerEligibilityStrategy();
      const durationPolicy = new StandardLoanDurationPolicyStrategy();
      const now = new Date('2026-11-05T14:00:00.000Z');

      const dueAt = durationPolicy.computeDueAt(now, 4);
      expect(dueAt.toISOString()).toBe('2026-11-05T18:00:00.000Z');

      const okRes = eligibility.evaluate({
        activeLoans: [],
        now,
        maxSimultaneousLoans: 2,
      });
      expect(okRes.eligible).toBe(true);

      const overdueRes = eligibility.evaluate({
        activeLoans: [
          {
            id: 'loan-1',
            organizationId: 'org-1',
            siteId: 'site-1',
            lendingPointId: null,
            personId: 'person-1',
            unitId: 'unit-1',
            modelId: 'model-1',
            status: 'overdue',
            conditionOut: 'good',
            conditionIn: null,
            signaturePath: 'sig.txt',
            signatureSha256: 'abc',
            dueAt: new Date('2026-11-04T10:00:00.000Z'),
            deliveredAt: new Date('2026-11-04T06:00:00.000Z'),
            returnedAt: null,
            returnNotes: null,
            idempotencyKey: 'idem-1',
            createdAt: new Date('2026-11-04T06:00:00.000Z'),
          },
        ],
        now,
        maxSimultaneousLoans: 2,
      });
      expect(overdueRes.eligible).toBe(false);
      expect(overdueRes.reason).toContain('préstamo vencido');

      expect(() => assertValidLoanTransition('active', 'returned')).not.toThrow();
      expect(() => assertValidLoanTransition('returned', 'active')).toThrow();
    });

    it('ejecuta flujo completo de inventario, reserva atómica sin doble asignación, préstamo con Idempotency-Key, devolución por QR, mora, reportes (CSV/XLSX/PDF) y aislamiento multi-tenant', async () => {
      const harness = await createHarness(mode);
      await harness.container.seedInitialData();
      const server = await buildServer(harness.container);

      try {
        // 1. Login admin Entidad A
        const loginRes = await server.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: {
            email: 'admin@demo.tap',
            password: harness.adminPassword,
          },
        });
        expect(loginRes.statusCode).toBe(200);
        let { accessToken: tokenA } = loginRes.json<{ accessToken: string }>();

        // 2. Consultar punto público sembrado `/p/PREST1`
        const pointInfoRes = await server.inject({
          method: 'GET',
          url: '/api/v1/public/lending-points/PREST1',
        });
        expect(pointInfoRes.statusCode).toBe(200);
        const pointInfo = pointInfoRes.json<PublicLendingPointInfo>();
        expect(pointInfo.publicCode).toBe('PREST1');
        expect(pointInfo.availableModels.length).toBeGreaterThanOrEqual(2);

        const pingPongModel = pointInfo.availableModels.find((m) => m.codePrefix === 'RAQ')!;
        expect(pingPongModel.availableCount).toBe(1);

        // 3. Solicitar préstamo público sin Idempotency-Key -> rechaza con 400
        const missingIdemRes = await server.inject({
          method: 'POST',
          url: '/api/v1/public/lending-points/PREST1/loans',
          payload: {
            identificationMode: 'document',
            identifier: '1088776655',
            modelId: pingPongModel.id,
            acceptedDataConsent: true,
            signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC',
            walkInRegistration: {
              documentType: 'CC',
              documentNumber: '1088776655',
              fullName: 'Mateo Alejandro Giraldo',
              email: 'mateo.giraldo@demo.tap',
              personType: 'student',
              isMinor: false,
            },
          },
        });
        expect(missingIdemRes.statusCode).toBe(400);

        // 4. Solicitar préstamo público con Idempotency-Key -> crea préstamo y asigna RAQ-001
        const createLoanRes = await server.inject({
          method: 'POST',
          url: '/api/v1/public/lending-points/PREST1/loans',
          headers: {
            'idempotency-key': 'idem-key-raq-001',
          },
          payload: {
            identificationMode: 'document',
            identifier: '1088776655',
            modelId: pingPongModel.id,
            acceptedDataConsent: true,
            signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC',
            walkInRegistration: {
              documentType: 'CC',
              documentNumber: '1088776655',
              fullName: 'Mateo Alejandro Giraldo',
              email: 'mateo.giraldo@demo.tap',
              personType: 'student',
              isMinor: false,
            },
          },
        });
        expect(createLoanRes.statusCode).toBe(201);
        const createdLoan = createLoanRes.json<LoanDto>();
        expect(createdLoan.unitCode).toBe('RAQ-001');
        expect(createdLoan.status).toBe('active');
        expect(createdLoan.signatureSha256).toHaveLength(64);

        // 5. Reintentar con la misma Idempotency-Key -> devuelve el mismo préstamo sin duplicar
        const retryIdemRes = await server.inject({
          method: 'POST',
          url: '/api/v1/public/lending-points/PREST1/loans',
          headers: {
            'idempotency-key': 'idem-key-raq-001',
          },
          payload: {
            identificationMode: 'document',
            identifier: '1088776655',
            modelId: pingPongModel.id,
            acceptedDataConsent: true,
            signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC',
          },
        });
        expect(retryIdemRes.statusCode).toBe(201);
        expect(retryIdemRes.json<LoanDto>().id).toBe(createdLoan.id);

        // 6. Otra persona intenta pedir la última unidad de RAQ (que ya está prestada) -> 409 Conflict
        const exhaustedRes = await server.inject({
          method: 'POST',
          url: '/api/v1/public/lending-points/PREST1/loans',
          headers: {
            'idempotency-key': 'idem-key-raq-002-conflict',
          },
          payload: {
            identificationMode: 'document',
            identifier: '1088776699',
            modelId: pingPongModel.id,
            acceptedDataConsent: true,
            signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC',
            walkInRegistration: {
              documentType: 'CC',
              documentNumber: '1088776699',
              fullName: 'Valeria Ospina',
              email: 'valeria.ospina@demo.tap',
              personType: 'student',
              isMinor: false,
            },
          },
        });
        expect(exhaustedRes.statusCode).toBe(409);

        // 7. Avanzar el reloj 5 horas para que el préstamo de Mateo entre en mora, renovar JWT (TTL 15m) y ejecutar sweep-overdue
        harness.clock.advanceMs(5 * 3600_000);
        const reloginRes = await server.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: {
            email: 'admin@demo.tap',
            password: harness.adminPassword,
          },
        });
        tokenA = reloginRes.json<{ accessToken: string }>().accessToken;

        const sweepRes = await server.inject({
          method: 'POST',
          url: '/api/v1/loans/sweep-overdue',
          headers: { authorization: `Bearer ${tokenA}` },
        });
        expect(sweepRes.statusCode).toBe(200);
        const sweepBody = sweepRes.json<OverdueSweepResponse>();
        expect(sweepBody.newlyMarkedOverdueCount).toBe(1);

        // 8. Mientras Mateo está en mora, consultar lookup en `/public/lending-points/PREST1/lookup` indica `eligible: false`
        const lookupOverdueRes = await server.inject({
          method: 'POST',
          url: '/api/v1/public/lending-points/PREST1/lookup',
          payload: {
            identificationMode: 'document',
            identifier: '1088776655',
          },
        });
        expect(lookupOverdueRes.statusCode).toBe(200);
        expect(lookupOverdueRes.json<{ eligible: boolean; maskedName: string }>().eligible).toBe(
          false,
        );
        expect(lookupOverdueRes.json<{ maskedName: string }>().maskedName).toBe('Mateo G.');

        // 9. Devolver la unidad escaneando su código `RAQ-001` (`POST /loans/return-by-qr`)
        const returnRes = await server.inject({
          method: 'POST',
          url: '/api/v1/loans/return-by-qr',
          headers: { authorization: `Bearer ${tokenA}` },
          payload: {
            unitQrOrCode: 'RAQ-001',
            conditionIn: 'good',
            notes: 'Devuelta en perfecto estado',
          },
        });
        expect(returnRes.statusCode).toBe(200);
        expect(returnRes.json<LoanDto>().status).toBe('returned');

        // Verificar que la unidad RAQ-001 volvió a estar `available`
        const unitsRes = await server.inject({
          method: 'GET',
          url: `/api/v1/inventory/units?modelId=${pingPongModel.id}`,
          headers: { authorization: `Bearer ${tokenA}` },
        });
        expect(unitsRes.statusCode).toBe(200);
        expect(unitsRes.json<InventoryUnitDto[]>()[0]?.status).toBe('available');

        // 10. Consultar dashboard y reportes descargables (CSV, XLSX, PDF) en Fase 6
        const dashRes = await server.inject({
          method: 'GET',
          url: '/api/v1/reports/dashboard',
          headers: { authorization: `Bearer ${tokenA}` },
        });
        expect(dashRes.statusCode).toBe(200);
        const dash = dashRes.json<DashboardSummaryResponse>();
        expect(dash.kpis.totalInventoryUnits).toBeGreaterThanOrEqual(3);

        // Exportar préstamos en CSV con documentos enmascarados por defecto
        const csvMaskedRes = await server.inject({
          method: 'GET',
          url: '/api/v1/reports/export?type=loans&format=csv',
          headers: { authorization: `Bearer ${tokenA}` },
        });
        expect(csvMaskedRes.statusCode).toBe(200);
        expect(csvMaskedRes.body).toContain('•••6655');
        expect(csvMaskedRes.body).not.toContain('1088776655');

        // Exportar en XLSX y PDF
        const xlsxRes = await server.inject({
          method: 'GET',
          url: '/api/v1/reports/export?type=inventory&format=xlsx',
          headers: { authorization: `Bearer ${tokenA}` },
        });
        expect(xlsxRes.statusCode).toBe(200);
        expect(xlsxRes.headers['content-type']).toContain('spreadsheetml.sheet');

        const pdfRes = await server.inject({
          method: 'GET',
          url: '/api/v1/reports/export?type=loans&format=pdf',
          headers: { authorization: `Bearer ${tokenA}` },
        });
        expect(pdfRes.statusCode).toBe(200);
        expect(pdfRes.rawPayload.subarray(0, 5).toString('utf8')).toBe('%PDF-');

        // 11. Aislamiento multi-tenant: Entidad B no ve inventario ni préstamos de Entidad A
        const orgBId = harness.container.idGenerator.nextId();
        await harness.container.organizationsModule.repository.create({
          id: orgBId,
          name: 'Entidad Deportiva B',
          slug: 'entidad-deportiva-b',
          type: 'ente_deportivo',
          plan: 'standard',
          features: { ...DEFAULT_FEATURE_FLAGS },
          logoUrl: null,
          timezone: 'America/Bogota',
          allowedEmailDomains: [],
          dataConsentVersion: 'v1.0',
          dataConsentText: 'Texto B',
          retentionDays: 365,
          createdAt: harness.clock.now(),
          updatedAt: harness.clock.now(),
        });

        await harness.container.accessModule.service.seedStaffUser({
          organizationId: orgBId,
          email: 'admin@entidad-b.tap',
          fullName: 'Admin Entidad B',
          password: harness.adminPassword,
          role: 'org_admin',
        });

        const loginBRes = await server.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: {
            email: 'admin@entidad-b.tap',
            password: harness.adminPassword,
          },
        });
        const { accessToken: tokenB } = loginBRes.json<{ accessToken: string }>();

        const loansBRes = await server.inject({
          method: 'GET',
          url: '/api/v1/loans',
          headers: { authorization: `Bearer ${tokenB}` },
        });
        expect(loansBRes.statusCode).toBe(200);
        expect(loansBRes.json<LoanDto[]>()).toHaveLength(0);
      } finally {
        await server.close();
      }
    });
  });
}
