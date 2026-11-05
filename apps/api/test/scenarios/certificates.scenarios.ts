import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app/server.ts';
import {
  AnyAttendanceStrategy,
  MinAttendancePercentStrategy,
  MinSessionsStrategy,
  NoCertificateStrategy,
  generateCertificateCode,
  isValidCertificateCodeCheckDigit,
} from '../../src/modules/certificates/index.ts';
import { DEFAULT_FEATURE_FLAGS } from '../../src/modules/organizations/index.ts';
import {
  createHarness,
  disposeAllHarnesses,
  listAuditActions,
  type HarnessMode,
} from '../support/harness.ts';

export function defineCertificatesScenarios(mode: HarnessMode) {
  afterEach(async () => {
    await disposeAllHarnesses();
  });

  describe(`Módulos certificates y notifications: elegibilidad, emisión idempotente, PDF con QR, revocación y aislamiento (Fase 4) [${mode}]`, () => {
    it('evalúa correctamente las estrategias de elegibilidad (Strategy) y el dígito de control Luhn mod N', () => {
      for (let i = 0; i < 15; i += 1) {
        const code = generateCertificateCode();
        expect(code).toHaveLength(12);
        expect(isValidCertificateCodeCheckDigit(code)).toBe(true);
        const tampered = code.slice(0, 11) + (code[11] === '2' ? '3' : '2');
        expect(isValidCertificateCodeCheckDigit(tampered)).toBe(false);
      }

      const anyStrategy = new AnyAttendanceStrategy();
      expect(anyStrategy.evaluate({ attendedSessions: 1, totalSessions: 4 }).eligible).toBe(true);
      expect(anyStrategy.evaluate({ attendedSessions: 0, totalSessions: 4 }).eligible).toBe(false);

      const minSessions = new MinSessionsStrategy(3);
      expect(minSessions.evaluate({ attendedSessions: 3, totalSessions: 4 }).eligible).toBe(true);
      expect(minSessions.evaluate({ attendedSessions: 2, totalSessions: 4 }).eligible).toBe(false);

      const minPercent = new MinAttendancePercentStrategy(75);
      expect(minPercent.evaluate({ attendedSessions: 3, totalSessions: 4 }).eligible).toBe(true);
      expect(minPercent.evaluate({ attendedSessions: 2, totalSessions: 4 }).eligible).toBe(false);

      const noCert = new NoCertificateStrategy();
      expect(noCert.evaluate({ attendedSessions: 4, totalSessions: 4 }).eligible).toBe(false);
    });

    it('evalúa elegibilidad, emite en lote sin duplicar, genera PDF con QR, envía correo, verifica públicamente sin documento, revoca y aísla entidades', async () => {
      const harness = await createHarness(mode);
      await harness.container.seedInitialData();
      const server = await buildServer(harness.container);

      try {
        // 1. Login como admin de Entidad A
        const loginRes = await server.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: {
            email: 'admin@demo.tap',
            password: harness.adminPassword,
          },
        });
        expect(loginRes.statusCode).toBe(200);
        const { accessToken: tokenA } = loginRes.json<{ accessToken: string }>();

        // 2. Crear 2 personas en Entidad A (una asistirá a las 2 sesiones, otra solo a 1)
        const person1Res = await server.inject({
          method: 'POST',
          url: '/api/v1/people',
          headers: { authorization: `Bearer ${tokenA}` },
          payload: {
            documentType: 'CC',
            documentNumber: '1088990011',
            institutionalCode: '20261001',
            fullName: 'Camila Andrea Restrepo',
            email: 'camila.restrepo@demo.tap',
            personType: 'student',
            isMinor: false,
          },
        });
        expect(person1Res.statusCode).toBe(201);
        const person1 = person1Res.json<{ id: string }>();

        const person2Res = await server.inject({
          method: 'POST',
          url: '/api/v1/people',
          headers: { authorization: `Bearer ${tokenA}` },
          payload: {
            documentType: 'CC',
            documentNumber: '1088990022',
            institutionalCode: '20261002',
            fullName: 'Jorge Eliécer Lozada',
            email: 'jorge.lozada@demo.tap',
            personType: 'student',
            isMinor: false,
          },
        });
        expect(person2Res.statusCode).toBe(201);

        // 3. Crear curso de 2 sesiones con regla min_sessions = 2
        const createCourseRes = await server.inject({
          method: 'POST',
          url: '/api/v1/events',
          headers: { authorization: `Bearer ${tokenA}` },
          payload: {
            name: 'Taller de Liderazgo Universitario',
            type: 'course',
            startsAt: '2026-11-04T14:00:00.000Z',
            endsAt: '2026-11-04T18:00:00.000Z',
            checkinOpensAt: '2026-11-04T13:30:00.000Z',
            checkinClosesAt: '2026-11-04T18:30:00.000Z',
            certificateRule: {
              type: 'min_sessions',
              minSessions: 2,
              hours: 6,
            },
            autoIssueCertificates: false,
            sessions: [
              {
                title: 'Sesión 1: Comunicación asertiva',
                startsAt: '2026-11-04T14:00:00.000Z',
                endsAt: '2026-11-04T16:00:00.000Z',
              },
              {
                title: 'Sesión 2: Trabajo en equipo',
                startsAt: '2026-11-04T16:00:00.000Z',
                endsAt: '2026-11-04T18:00:00.000Z',
              },
            ],
          },
        });
        expect(createCourseRes.statusCode).toBe(201);
        const course = createCourseRes.json<{
          id: string;
          sessions: Array<{ id: string }>;
        }>();
        const session1Id = course.sessions[0]!.id;
        const session2Id = course.sessions[1]!.id;

        await server.inject({
          method: 'POST',
          url: `/api/v1/events/${course.id}/publish`,
          headers: { authorization: `Bearer ${tokenA}` },
        });
        await server.inject({
          method: 'POST',
          url: `/api/v1/events/${course.id}/open`,
          headers: { authorization: `Bearer ${tokenA}` },
        });

        // 4. Registrar asistencias: Camila asiste a las 2 sesiones; Jorge solo a la sesión 1
        for (const sid of [session1Id, session2Id]) {
          const checkinRes = await server.inject({
            method: 'POST',
            url: `/api/v1/events/${course.id}/attendance`,
            headers: { authorization: `Bearer ${tokenA}` },
            payload: {
              identificationMode: 'document',
              identifier: '1088990011',
              sessionId: sid,
            },
          });
          expect(checkinRes.statusCode).toBe(200);
        }

        const checkinJorgeRes = await server.inject({
          method: 'POST',
          url: `/api/v1/events/${course.id}/attendance`,
          headers: { authorization: `Bearer ${tokenA}` },
          payload: {
            identificationMode: 'document',
            identifier: '1088990022',
            sessionId: session1Id,
          },
        });
        expect(checkinJorgeRes.statusCode).toBe(200);

        // 5. Evaluar elegibilidad: 1 elegible (Camila) y 1 no elegible (Jorge)
        const evalRes = await server.inject({
          method: 'POST',
          url: `/api/v1/events/${course.id}/certificates/evaluate`,
          headers: { authorization: `Bearer ${tokenA}` },
        });
        expect(evalRes.statusCode).toBe(200);
        const evalBody = evalRes.json<{
          eligibleCount: number;
          ineligibleCount: number;
          eligible: Array<{ personId: string; fullName: string }>;
          ineligible: Array<{ personId: string; fullName: string; reason: string }>;
        }>();
        expect(evalBody.eligibleCount).toBe(1);
        expect(evalBody.ineligibleCount).toBe(1);
        expect(evalBody.eligible[0]?.personId).toBe(person1.id);
        expect(evalBody.ineligible[0]?.reason).toContain('requiere al menos 2');

        // 6. Emitir en lote (primera vez -> 1 emitido)
        const issue1Res = await server.inject({
          method: 'POST',
          url: `/api/v1/events/${course.id}/certificates/issue`,
          headers: { authorization: `Bearer ${tokenA}` },
          payload: { hours: '6' },
        });
        expect(issue1Res.statusCode).toBe(200);
        const issue1Body = issue1Res.json<{
          issuedCount: number;
          skippedAlreadyIssuedCount: number;
          certificates: Array<{
            id: string;
            code: string;
            pdfSha256: string | null;
            deliveredAt: string | null;
          }>;
        }>();
        expect(issue1Body.issuedCount).toBe(1);
        expect(issue1Body.skippedAlreadyIssuedCount).toBe(0);
        const cert = issue1Body.certificates[0]!;
        expect(cert.code).toHaveLength(12);
        expect(cert.pdfSha256).toBeTruthy();
        expect(cert.deliveredAt).toBeTruthy();

        // 7. Emitir en lote por segunda vez -> idempotencia estricta (0 nuevos, 1 omitido)
        const issue2Res = await server.inject({
          method: 'POST',
          url: `/api/v1/events/${course.id}/certificates/issue`,
          headers: { authorization: `Bearer ${tokenA}` },
          payload: { hours: '6' },
        });
        expect(issue2Res.statusCode).toBe(200);
        const issue2Body = issue2Res.json<{
          issuedCount: number;
          skippedAlreadyIssuedCount: number;
        }>();
        expect(issue2Body.issuedCount).toBe(0);
        expect(issue2Body.skippedAlreadyIssuedCount).toBe(1);

        // 8. Descargar el PDF y verificar que es un PDF válido y su SHA-256 coincide
        const pdfRes = await server.inject({
          method: 'GET',
          url: `/api/v1/certificates/${cert.id}/pdf`,
          headers: { authorization: `Bearer ${tokenA}` },
        });
        expect(pdfRes.statusCode).toBe(200);
        expect(pdfRes.headers['content-type']).toContain('application/pdf');
        expect(pdfRes.rawPayload.subarray(0, 5).toString('utf8')).toBe('%PDF-');
        const downloadedHash = createHash('sha256').update(pdfRes.rawPayload).digest('hex');
        expect(downloadedHash).toBe(cert.pdfSha256);

        // 9. Verificar el registro de notificaciones enviadas
        const notifRes = await server.inject({
          method: 'GET',
          url: '/api/v1/notifications',
          headers: { authorization: `Bearer ${tokenA}` },
        });
        expect(notifRes.statusCode).toBe(200);
        const notifBody = notifRes.json<{
          sentCount: number;
          items: Array<{ recipient: string; status: string; template: string }>;
        }>();
        expect(notifBody.sentCount).toBeGreaterThanOrEqual(1);
        expect(notifBody.items[0]?.recipient).toBe('camila.restrepo@demo.tap');
        expect(notifBody.items[0]?.status).toBe('sent');
        expect(notifBody.items[0]?.template).toBe('certificate_issued');

        // 10. Verificación pública sin cuenta (`/api/v1/public/certificates/verify/:code`)
        // Devuelve validez, titular, evento y entidad, pero JAMÁS el número de documento
        const verifyValidRes = await server.inject({
          method: 'GET',
          url: `/api/v1/public/certificates/verify/${cert.code}`,
        });
        expect(verifyValidRes.statusCode).toBe(200);
        const verifyValidText = verifyValidRes.body;
        expect(verifyValidText).not.toContain('1088990011');
        const verifyValidJson = verifyValidRes.json<{
          found: boolean;
          status: string;
          holderName: string;
          eventName: string;
        }>();
        expect(verifyValidJson.found).toBe(true);
        expect(verifyValidJson.status).toBe('valid');
        expect(verifyValidJson.holderName).toBe('Camila Andrea Restrepo');
        expect(verifyValidJson.eventName).toBe('Taller de Liderazgo Universitario');

        // 11. Revocar el certificado con motivo -> se refleja en verificación pública y en AuditLog
        const revokeRes = await server.inject({
          method: 'POST',
          url: `/api/v1/certificates/${cert.id}/revoke`,
          headers: { authorization: `Bearer ${tokenA}` },
          payload: {
            reason: 'Corrección administrativa de acta de cierre',
          },
        });
        expect(revokeRes.statusCode).toBe(200);

        const verifyRevokedRes = await server.inject({
          method: 'GET',
          url: `/api/v1/public/certificates/verify/${cert.code}`,
        });
        expect(verifyRevokedRes.statusCode).toBe(200);
        const verifyRevokedJson = verifyRevokedRes.json<{
          status: string;
          revokedReason: string;
        }>();
        expect(verifyRevokedJson.status).toBe('revoked');
        expect(verifyRevokedJson.revokedReason).toBe('Corrección administrativa de acta de cierre');

        const actions = await listAuditActions(harness);
        expect(actions).toContain('certificates.batch_issued');
        expect(actions).toContain('certificate.revoked');

        // 12. Aislamiento multi-tenant: Entidad B no puede ver ni descargar certificados de Entidad A
        const orgBId = harness.container.idGenerator.nextId();
        const now = harness.clock.now();
        await harness.container.organizationsModule.repository.create({
          id: orgBId,
          name: 'Entidad B Externa',
          slug: 'entidad-b-externa',
          type: 'empresa',
          plan: 'institutional',
          features: { ...DEFAULT_FEATURE_FLAGS },
          logoUrl: null,
          timezone: 'America/Bogota',
          allowedEmailDomains: [],
          dataConsentVersion: 'v1.0',
          dataConsentText: 'Autorización B',
          retentionDays: 365,
          createdAt: now,
          updatedAt: now,
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

        const crossDownloadRes = await server.inject({
          method: 'GET',
          url: `/api/v1/certificates/${cert.id}/pdf`,
          headers: { authorization: `Bearer ${tokenB}` },
        });
        expect(crossDownloadRes.statusCode).toBe(404);
      } finally {
        await server.close();
      }
    });
  });
}
