import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app/server.ts';
import {
  EventBuilder,
  EventFactory,
  assertEventEditable,
  transitionEventState,
} from '../../src/modules/events/index.ts';
import { ConflictError, CryptoIdGenerator, ValidationError } from '../../src/shared/index.ts';

import { createHarness, disposeAllHarnesses, type HarnessMode } from '../support/harness.ts';

export function eventsScenarios(mode: HarnessMode): void {
  describe(`Patrones de dominio y ciclo de vida del módulo events (Fase 2) [${mode}]`, () => {
    afterEach(disposeAllHarnesses);

    it('valida invariantes en EventBuilder y aplica valores por defecto en EventFactory (Mass, Course, Recurring)', () => {
      const idGenerator = new CryptoIdGenerator();
      const now = new Date('2026-11-04T14:00:00.000Z');
      const orgId = idGenerator.nextId();

      // 1. MassEventCreator crea sesión única por defecto y activa allowWalkIn + confirmIdentity
      const massEvent = EventFactory.create({
        id: idGenerator.nextId(),
        organizationId: orgId,
        publicCode: 'MASIVO26',
        now,
        idGenerator,
        request: {
          name: 'Feria de Bienestar Universitario 2026',
          type: 'mass',
          startsAt: '2026-11-10T14:00:00.000Z',
          endsAt: '2026-11-10T18:00:00.000Z',
        },
      });
      expect(massEvent.status).toBe('draft');
      expect(massEvent.allowWalkIn).toBe(true);
      expect(massEvent.confirmIdentity).toBe(true);
      expect(massEvent.sessions).toHaveLength(1);
      expect(massEvent.certificateRule.type).toBe('any_attendance');

      // 2. CourseEventCreator exige al menos 2 sesiones
      expect(() =>
        EventFactory.create({
          id: idGenerator.nextId(),
          organizationId: orgId,
          publicCode: 'CURSO001',
          now,
          idGenerator,
          request: {
            name: 'Curso de Primeros Auxilios',
            type: 'course',
            startsAt: '2026-11-10T14:00:00.000Z',
            endsAt: '2026-11-17T16:00:00.000Z',
            sessions: [
              {
                title: 'Sesión 1',
                startsAt: '2026-11-10T14:00:00.000Z',
                endsAt: '2026-11-10T16:00:00.000Z',
              },
            ],
          },
        }),
      ).toThrow(ValidationError);

      const validCourse = EventFactory.create({
        id: idGenerator.nextId(),
        organizationId: orgId,
        publicCode: 'CURSO002',
        now,
        idGenerator,
        request: {
          name: 'Curso de Primeros Auxilios Completo',
          type: 'course',
          startsAt: '2026-11-10T14:00:00.000Z',
          endsAt: '2026-11-17T16:00:00.000Z',
          sessions: [
            {
              title: 'Sesión 1',
              startsAt: '2026-11-10T14:00:00.000Z',
              endsAt: '2026-11-10T16:00:00.000Z',
            },
            {
              title: 'Sesión 2',
              startsAt: '2026-11-17T14:00:00.000Z',
              endsAt: '2026-11-17T16:00:00.000Z',
            },
          ],
        },
      });
      expect(validCourse.sessions).toHaveLength(2);
      expect(validCourse.certificateRule.type).toBe('min_attendance_percent');
      expect(validCourse.certificateRule.minPercent).toBe(80);
      expect(validCourse.autoIssueCertificates).toBe(true);

      // 3. EventBuilder rechaza endsAt <= startsAt
      expect(() =>
        new EventBuilder()
          .setIdentity({
            id: idGenerator.nextId(),
            organizationId: orgId,
            publicCode: 'ERRFECHA',
            now,
          })
          .setBasicInfo({ name: 'Evento Inválido', type: 'mass' })
          .setSchedule({
            startsAt: new Date('2026-11-10T18:00:00.000Z'),
            endsAt: new Date('2026-11-10T14:00:00.000Z'),
          })
          .build(),
      ).toThrow(ValidationError);

      // 4. Prototype: duplicate() clona configuración y sesiones en estado draft con nuevo código
      const duplicated = validCourse.duplicate({
        idGenerator,
        newPublicCode: 'COPIA999',
        now,
        newName: 'Curso de Primeros Auxilios — Cohorte 2',
      });
      expect(duplicated.id).not.toBe(validCourse.id);
      expect(duplicated.publicCode).toBe('COPIA999');
      expect(duplicated.status).toBe('draft');
      expect(duplicated.sessions).toHaveLength(2);
      expect(duplicated.sessions[0]?.id).not.toBe(validCourse.sessions[0]?.id);
    });

    it('gobierna las transiciones con State, emite eventos de dominio y rechaza transiciones inválidas', () => {
      const idGenerator = new CryptoIdGenerator();
      const now = new Date('2026-11-04T14:00:00.000Z');
      const draftEvent = EventFactory.create({
        id: idGenerator.nextId(),
        organizationId: idGenerator.nextId(),
        publicCode: 'ESTADO26',
        now,
        idGenerator,
        request: {
          name: 'Torneo Relámpago de Tenis de Mesa',
          type: 'mass',
          startsAt: '2026-11-10T14:00:00.000Z',
          endsAt: '2026-11-10T18:00:00.000Z',
        },
      });

      // No se puede cerrar directamente un evento en borrador (draft -> close inválido)
      expect(() =>
        transitionEventState({
          event: draftEvent,
          action: 'close',
          now,
          eventIdGenerator: idGenerator,
        }),
      ).toThrow(ConflictError);

      // draft -> scheduled (publish)
      const published = transitionEventState({
        event: draftEvent,
        action: 'publish',
        now,
        eventIdGenerator: idGenerator,
      });
      expect(published.updated.status).toBe('scheduled');
      expect(published.domainEvent.name).toBe('event.published');

      // scheduled -> open (open)
      const opened = transitionEventState({
        event: published.updated,
        action: 'open',
        now,
        eventIdGenerator: idGenerator,
      });
      expect(opened.updated.status).toBe('open');
      expect(opened.domainEvent.name).toBe('event.opened');

      // Un evento abierto ya no se puede editar
      expect(() => assertEventEditable(opened.updated)).toThrow(ConflictError);

      // open -> closed (close)
      const closed = transitionEventState({
        event: opened.updated,
        action: 'close',
        now,
        eventIdGenerator: idGenerator,
      });
      expect(closed.updated.status).toBe('closed');
      expect(closed.domainEvent.name).toBe('event.closed');

      // Un evento cerrado no puede volver a abrirse ni cancelarse
      expect(() =>
        transitionEventState({
          event: closed.updated,
          action: 'open',
          now,
          eventIdGenerator: idGenerator,
        }),
      ).toThrow(ConflictError);
      expect(() =>
        transitionEventState({
          event: closed.updated,
          action: 'cancel',
          now,
          eventIdGenerator: idGenerator,
        }),
      ).toThrow(ConflictError);
    });

    it('ejecuta flujo HTTP completo (crear, publicar, apertura/cierre programados, QR, afiche PDF y aislamiento)', async () => {
      const { container, clock, adminPassword } = await createHarness(mode);
      await container.seedInitialData();
      const server = await buildServer(container);

      const loginRes = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'admin@demo.tap', password: adminPassword },
      });
      const token: string = loginRes.json().accessToken;

      // 1. Crear evento con ventana de check-in que abre a las 14:05 y cierra a las 14:12
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Semana de la Salud y el Deporte',
          description: 'Jornada masiva de actividad física en el campus.',
          type: 'mass',
          startsAt: '2026-11-04T14:05:00.000Z',
          endsAt: '2026-11-04T14:12:00.000Z',
          checkinOpensAt: '2026-11-04T14:05:00.000Z',
          checkinClosesAt: '2026-11-04T14:12:00.000Z',
          capacity: 1500,
        },
      });
      expect(createRes.statusCode).toBe(201);
      const createdEvent = createRes.json();
      expect(createdEvent.publicCode).toHaveLength(8);
      expect(createdEvent.status).toBe('draft');

      // 2. Publicar evento -> scheduled
      const publishRes = await server.inject({
        method: 'POST',
        url: `/api/v1/events/${createdEvent.id}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(publishRes.statusCode).toBe(200);
      expect(publishRes.json().status).toBe('scheduled');

      // 3. Avanzamos el reloj 6 minutos (14:06) y ejecutamos el trabajo programado de apertura
      clock.advanceMs(6 * 60_000);
      const stepOpen = await container.eventsModule.processScheduledTransitions();
      expect(stepOpen.openedCount).toBe(1);

      const detailOpen = await server.inject({
        method: 'GET',
        url: `/api/v1/events/${createdEvent.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(detailOpen.json().status).toBe('open');

      // 4. Obtener QR (PNG Data URL + SVG) y afiche PDF
      const qrRes = await server.inject({
        method: 'GET',
        url: `/api/v1/events/${createdEvent.id}/qr`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(qrRes.statusCode).toBe(200);
      expect(qrRes.json().qrDataUrl).toContain('data:image/png;base64,');
      expect(qrRes.json().qrSvg).toContain('<svg');

      const pdfRes = await server.inject({
        method: 'GET',
        url: `/api/v1/events/${createdEvent.id}/poster.pdf`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(pdfRes.statusCode).toBe(200);
      expect(pdfRes.headers['content-type']).toContain('application/pdf');
      expect(pdfRes.rawPayload.subarray(0, 5).toString('utf8')).toBe('%PDF-');

      // 5. Avanzamos el reloj otros 7 minutos (14:13) y ejecutamos el cierre automático programado
      clock.advanceMs(7 * 60_000);
      const stepClose = await container.eventsModule.processScheduledTransitions();
      expect(stepClose.closedCount).toBe(1);

      const detailClosed = await server.inject({
        method: 'GET',
        url: `/api/v1/events/${createdEvent.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(detailClosed.json().status).toBe('closed');

      await server.close();
    });
  });
}
