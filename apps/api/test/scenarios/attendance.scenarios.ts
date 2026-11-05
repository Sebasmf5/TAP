import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app/server.ts';
import {
  IdentificationStrategyRegistry,
  computeMedian,
  type PersonLookupGateway,
} from '../../src/modules/attendance/index.ts';
import { DEFAULT_FEATURE_FLAGS } from '../../src/modules/organizations/index.ts';
import { ValidationError } from '../../src/shared/index.ts';

import {
  createHarness,
  disposeAllHarnesses,
  listAuditActions,
  type HarnessMode,
} from '../support/harness.ts';

export function attendanceScenarios(mode: HarnessMode): void {
  describe(`Módulo attendance: IdentificationStrategy, idempotencia, modo quiosco y aislamiento (Fase 3) [${mode}]`, () => {
    afterEach(disposeAllHarnesses);

    it('aplica el patrón IdentificationStrategy y bloquea modos no permitidos por el evento', async () => {
      const registry = new IdentificationStrategyRegistry();
      const fakeGateway: PersonLookupGateway = {
        async findById() {
          return null;
        },
        async findByDocument(_orgId, doc) {
          if (doc === '1116254321') {
            return {
              id: '018f0000-0000-7000-8000-000000000001',
              organizationId: '018f0000-0000-7000-8000-000000000099',
              documentType: 'CC',
              documentNumber: '1116254321',
              institutionalCode: '20261001',
              fullName: 'Juan Pérez Restrepo',
              personType: 'student',
            };
          }
          return null;
        },
        async findByInstitutionalCode(_orgId, code) {
          if (code === '20261001') {
            return {
              id: '018f0000-0000-7000-8000-000000000001',
              organizationId: '018f0000-0000-7000-8000-000000000099',
              documentType: 'CC',
              documentNumber: '1116254321',
              institutionalCode: '20261001',
              fullName: 'Juan Pérez Restrepo',
              personType: 'student',
            };
          }
          return null;
        },
        async findByQrToken(_orgId, qr) {
          if (qr === 'CARNETQR2026') {
            return {
              id: '018f0000-0000-7000-8000-000000000001',
              organizationId: '018f0000-0000-7000-8000-000000000099',
              documentType: 'CC',
              documentNumber: '1116254321',
              institutionalCode: '20261001',
              fullName: 'Juan Pérez Restrepo',
              personType: 'student',
            };
          }
          return null;
        },
      };

      const byDoc = await registry.resolve({
        request: {
          organizationId: '018f0000-0000-7000-8000-000000000099',
          mode: 'document',
          identifier: '1116254321',
        },
        allowedEventModes: ['document'],
        gateway: fakeGateway,
      });
      expect(byDoc?.fullName).toBe('Juan Pérez Restrepo');

      // Rechaza institutional_code si el evento solo permite document
      await expect(
        registry.resolve({
          request: {
            organizationId: '018f0000-0000-7000-8000-000000000099',
            mode: 'institutional_code',
            identifier: '20261001',
          },
          allowedEventModes: ['document'],
          gateway: fakeGateway,
        }),
      ).rejects.toThrow(ValidationError);

      // Rechaza person_qr desde flujo público sin override de funcionario
      await expect(
        registry.resolve({
          request: {
            organizationId: '018f0000-0000-7000-8000-000000000099',
            mode: 'person_qr',
            identifier: 'CARNETQR2026',
          },
          allowedEventModes: ['document', 'person_qr'],
          isStaffOverride: false,
          gateway: fakeGateway,
        }),
      ).rejects.toThrow(ValidationError);

      // Permite person_qr con override de funcionario
      const byQr = await registry.resolve({
        request: {
          organizationId: '018f0000-0000-7000-8000-000000000099',
          mode: 'person_qr',
          identifier: 'carnetqr2026',
        },
        allowedEventModes: ['document', 'person_qr'],
        isStaffOverride: true,
        gateway: fakeGateway,
      });
      expect(byQr?.institutionalCode).toBe('20261001');
      expect(computeMedian([1200, 3400, 2100])).toBe(2100);
      expect(computeMedian([1000, 2000, 3000, 4000])).toBe(2500);
    });

    it('ejecuta check-in público idempotente, protege privacidad en lookup («Juan P.»), soporta walk-in Ley 1581 y no ejecuta correo ni PDF en la ruta caliente', async () => {
      const harness = await createHarness(mode);
      const { container, clock, jobQueue, adminPassword } = harness;
      await container.seedInitialData();
      const app = await buildServer(container);

      const registeredDomainEvents: string[] = [];
      container.eventBus.subscribe('attendance.registered', (ev) => {
        registeredDomainEvents.push(ev.id);
      });

      // 1. Iniciar sesión como admin de la entidad piloto
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'admin@demo.tap',
          password: adminPassword,
        },
      });
      expect(loginRes.statusCode).toBe(200);
      const { accessToken } = loginRes.json<{ accessToken: string }>();

      // 2. Registrar un participante en el directorio
      const createPersonRes = await app.inject({
        method: 'POST',
        url: '/api/v1/people',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          documentType: 'CC',
          documentNumber: '1116987654',
          institutionalCode: '20265544',
          fullName: 'Juan Pérez',
          email: 'juan.perez@uceva.edu.co',
          personType: 'student',
          isMinor: false,
          consentAccepted: true,
        },
      });
      expect(createPersonRes.statusCode).toBe(201);
      const createdPerson = createPersonRes.json<{ id: string; qrToken: string }>();

      // 3. Crear evento masivo, publicarlo y abrirlo
      const createEventRes = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          name: 'Jornada Deportiva Universitaria',
          type: 'mass',
          location: 'Coliseo Cubierto',
          startsAt: '2026-11-04T14:30:00.000Z',
          endsAt: '2026-11-04T18:00:00.000Z',
          allowedIdentificationModes: ['document', 'institutional_code', 'person_qr'],
          confirmIdentity: true,
          allowWalkIn: true,
        },
      });
      expect(createEventRes.statusCode).toBe(201);
      const createdEvent = createEventRes.json<{ id: string; publicCode: string }>();

      await app.inject({
        method: 'POST',
        url: `/api/v1/events/${createdEvent.id}/publish`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/events/${createdEvent.id}/open`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      // 4. Consultar información pública del evento (`GET /public/checkin/:code`)
      const infoRes = await app.inject({
        method: 'GET',
        url: `/api/v1/public/checkin/${createdEvent.publicCode}`,
      });
      expect(infoRes.statusCode).toBe(200);
      const infoBody = infoRes.json<{
        event: { id: string; status: string; confirmIdentity: boolean; allowWalkIn: boolean };
        organization: { name: string; dataConsentVersion: string };
      }>();
      expect(infoBody.event.status).toBe('open');
      expect(infoBody.event.confirmIdentity).toBe(true);

      // 5. Lookup público (`POST /public/checkin/:code/lookup`): NUNCA expone nombre completo ni documento completo (AGENTS.md A7.2)
      const lookupRes = await app.inject({
        method: 'POST',
        url: `/api/v1/public/checkin/${createdEvent.publicCode}/lookup`,
        payload: {
          identificationMode: 'document',
          identifier: '1116987654',
        },
      });
      expect(lookupRes.statusCode).toBe(200);
      const lookupBody = lookupRes.json<{
        found: boolean;
        maskedName: string;
        maskedDocument: string;
      }>();
      expect(lookupBody.found).toBe(true);
      expect(lookupBody.maskedName).toBe('Juan P.');
      expect(lookupBody.maskedDocument).toBe('•••7654');
      expect(JSON.stringify(lookupBody)).not.toContain('Pérez');
      expect(JSON.stringify(lookupBody)).not.toContain('1116987654');

      // 6. Primer envío de check-in público (`POST /public/checkin/:code`) -> `registered`
      const firstCheckinRes = await app.inject({
        method: 'POST',
        url: `/api/v1/public/checkin/${createdEvent.publicCode}`,
        payload: {
          identificationMode: 'document',
          identifier: '1116987654',
          clientDurationMs: 2450,
        },
      });
      expect(firstCheckinRes.statusCode).toBe(200);
      const firstBody = firstCheckinRes.json<{
        outcome: string;
        attendanceId: string;
        checkedInAt: string;
        maskedName: string;
      }>();
      expect(firstBody.outcome).toBe('registered');
      expect(firstBody.checkedInAt).toBe('2026-11-04T15:00:00.000Z');
      expect(firstBody.maskedName).toBe('Juan P.');

      // Avanzar reloj 5 minutos y enviar varias veces (idempotencia estricta)
      clock.advanceMs(5 * 60_000);

      const parallelResponses = await Promise.all(
        Array.from({ length: 5 }, () =>
          app.inject({
            method: 'POST',
            url: `/api/v1/public/checkin/${createdEvent.publicCode}`,
            payload: {
              identificationMode: 'institutional_code',
              identifier: '20265544',
              clientDurationMs: 1800,
            },
          }),
        ),
      );

      for (const dupRes of parallelResponses) {
        expect(dupRes.statusCode).toBe(200);
        const dupBody = dupRes.json<{
          outcome: string;
          attendanceId: string;
          checkedInAt: string;
        }>();
        expect(dupBody.outcome).toBe('already_registered');
        expect(dupBody.attendanceId).toBe(firstBody.attendanceId);
        // Conserva la hora original del primer registro
        expect(dupBody.checkedInAt).toBe('2026-11-04T15:00:00.000Z');
      }

      // Solo se publicó 1 evento de dominio `attendance.registered` y 0 trabajos de correo/PDF en la ruta caliente
      expect(registeredDomainEvents).toHaveLength(1);
      expect(jobQueue.enqueued).toHaveLength(0);
      expect(harness.posterRenderCalls()).toBe(0);

      // 7. Flujo `allow_walk_in`: participante nuevo recibe `needs_registration` y en el segundo envío queda creado con Ley 1581 y registrado
      const walkInFirstRes = await app.inject({
        method: 'POST',
        url: `/api/v1/public/checkin/${createdEvent.publicCode}`,
        payload: {
          identificationMode: 'document',
          identifier: '1099887766',
        },
      });
      expect(walkInFirstRes.statusCode).toBe(200);
      expect(walkInFirstRes.json<{ outcome: string }>().outcome).toBe('needs_registration');

      const walkInSecondRes = await app.inject({
        method: 'POST',
        url: `/api/v1/public/checkin/${createdEvent.publicCode}`,
        payload: {
          identificationMode: 'document',
          identifier: '1099887766',
          clientDurationMs: 4100,
          walkInRegistration: {
            documentType: 'TI',
            documentNumber: '1099887766',
            fullName: 'Valentina Ríos Castaño',
            personType: 'student',
            isMinor: true,
            guardianName: 'Martha Castaño',
            guardianPhone: '3150001122',
            acceptedDataConsent: true,
          },
        },
      });
      expect(walkInSecondRes.statusCode).toBe(200);
      const walkInSecondBody = walkInSecondRes.json<{ outcome: string; maskedName: string }>();
      expect(walkInSecondBody.outcome).toBe('registered');
      expect(walkInSecondBody.maskedName).toBe('Valentina C.');

      // 8. Modo quiosco (`POST /events/:id/attendance/scan`), anulación auditada y aislamiento multi-tenant
      const voidRes = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${firstBody.attendanceId}/void`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          reason: 'Registro de prueba anulado por solicitud del coordinador',
        },
      });
      expect(voidRes.statusCode).toBe(200);
      expect(voidRes.json<{ status: string }>().status).toBe('voided');

      // Al estar anulado, ahora el funcionario puede volver a escanear el carné QR de esa persona en modo quiosco
      const scanRes = await app.inject({
        method: 'POST',
        url: `/api/v1/events/${createdEvent.id}/attendance/scan`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          qrToken: createdPerson.qrToken,
          clientDurationMs: 900,
        },
      });
      expect(scanRes.statusCode).toBe(200);
      expect(scanRes.json<{ outcome: string }>().outcome).toBe('registered');

      // Verificar listado y estadísticas del evento
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/v1/events/${createdEvent.id}/attendance`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = listRes.json<{
        summary: {
          totalValid: number;
          totalVoided: number;
          uniqueAttendees: number;
          byMethod: { event_qr: number; person_qr: number; manual: number };
        };
        records: Array<{ id: string; status: string }>;
      }>();
      expect(listBody.summary.totalValid).toBe(2);
      expect(listBody.summary.totalVoided).toBe(1);
      expect(listBody.summary.uniqueAttendees).toBe(2);
      expect(listBody.summary.byMethod.event_qr).toBe(1);
      expect(listBody.summary.byMethod.person_qr).toBe(1);

      // Verificar registro en AuditLog de la anulación
      expect(await listAuditActions(harness)).toContain('attendance.voided');

      // 9. Aislamiento entre entidades: un usuario de la Entidad B no puede ver ni anular asistencias de la Entidad A
      const orgBId = container.idGenerator.nextId();
      await container.organizationsModule.repository.create({
        id: orgBId,
        name: 'Instituto Deporte B',
        slug: 'deporte-b',
        type: 'ente_deportivo',
        plan: 'institutional',
        features: { ...DEFAULT_FEATURE_FLAGS },
        logoUrl: null,
        timezone: 'America/Bogota',
        allowedEmailDomains: [],
        dataConsentVersion: 'v1.0',
        dataConsentText: 'Autorización entidad B',
        retentionDays: 365,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      });
      await container.accessModule.service.seedStaffUser({
        organizationId: orgBId,
        email: 'admin@deporteb.tap',
        fullName: 'Admin Entidad B',
        password: adminPassword,
        role: 'org_admin',
      });

      const loginBRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'admin@deporteb.tap',
          password: adminPassword,
        },
      });
      const tokenB = loginBRes.json<{ accessToken: string }>().accessToken;

      const crossListRes = await app.inject({
        method: 'GET',
        url: `/api/v1/events/${createdEvent.id}/attendance`,
        headers: { authorization: `Bearer ${tokenB}` },
      });
      expect(crossListRes.statusCode).toBe(404);

      await app.close();
    });
  });
}
