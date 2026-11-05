import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app/server.ts';
import { abbreviatePersonName, maskDocumentNumber } from '../../src/modules/people/index.ts';

import { createHarness, disposeAllHarnesses, type HarnessMode } from '../support/harness.ts';

export function peopleScenarios(mode: HarnessMode): void {
  describe(`Directorio e importación CSV de participantes con errores fila por fila (Fase 2) [${mode}]`, () => {
    afterEach(disposeAllHarnesses);

    it('enmascara documentos (•••1234) y abrevia nombres públicos («Juan P.») según AGENTS.md A7.2 y A7.4', () => {
      expect(maskDocumentNumber('1116254890')).toBe('•••4890');
      expect(abbreviatePersonName('Juan Camilo Pérez Gómez')).toBe('Juan P.');
      expect(abbreviatePersonName('Valentina López')).toBe('Valentina L.');
    });

    it('valida vista previa de importación CSV, reporta errores fila por fila y ejecuta upsert al confirmar', async () => {
      const { container, adminPassword } = await createHarness(mode);
      await container.seedInitialData();
      const server = await buildServer(container);

      const loginRes = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'admin@demo.tap', password: adminPassword },
      });
      const token: string = loginRes.json().accessToken;

      // 1. Creamos una persona existente para comprobar que la importación la detecta como 'update'
      const existingRes = await server.inject({
        method: 'POST',
        url: '/api/v1/people',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          documentType: 'CC',
          documentNumber: '1116200100',
          institutionalCode: '20221001',
          fullName: 'María Fernanda Ríos',
          email: 'maria.rios@uceva.edu.co',
          personType: 'student',
          consentAccepted: true,
          consentVersion: 'v1.0',
        },
      });
      expect(existingRes.statusCode).toBe(201);
      expect(existingRes.json().maskedDocument).toBe('•••0100');
      expect(existingRes.json().abbreviatedName).toBe('María R.');

      // 2. Construimos un CSV con separador `;` (es-CO):
      // - Fila 2: válida (actualiza a María Fernanda Ríos)
      // - Fila 3: válida (crea nuevo estudiante mayor de edad)
      // - Fila 4: error (tipo de documento inválido 'DNI')
      // - Fila 5: error (menor de edad con TI sin datos de acudiente)
      // - Fila 6: válida (menor de edad con acudiente completo)
      // - Fila 7: error (documento duplicado respecto a la fila 3 dentro del mismo CSV)
      const csvContent = [
        'tipo_documento;documento;codigo;nombre_completo;correo;telefono;tipo_persona;es_menor;acudiente_nombre;acudiente_telefono',
        'CC;1116200100;20221001;María Fernanda Ríos Actualizada;maria.rios@uceva.edu.co;3150001111;estudiante;no;;',
        'CC;1116200200;20221002;Andrés Felipe Lozano;andres.lozano@uceva.edu.co;3150002222;estudiante;no;;',
        'DNI;99999999;20221003;Persona Documento Inválido;invalido@uceva.edu.co;;estudiante;no;;',
        'TI;1099300400;20241004;Sofía Menor Sin Acudiente;sofia@uceva.edu.co;;estudiante;si;;',
        'TI;1099300500;20241005;Mateo Menor Con Acudiente;mateo@uceva.edu.co;;estudiante;si;Claudia Gómez;3109998877',
        'CC;1116200200;20221099;Andrés Duplicado En Archivo;duplicado@uceva.edu.co;;estudiante;no;;',
      ].join('\n');

      // 3. Ejecutamos dryRun=true (vista previa sin escribir en la base de datos)
      const dryRunRes = await server.inject({
        method: 'POST',
        url: '/api/v1/people/import',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          csvContent,
          dryRun: true,
        },
      });
      expect(dryRunRes.statusCode).toBe(200);
      const dryBody = dryRunRes.json();
      expect(dryBody.dryRun).toBe(true);
      expect(dryBody.totalRows).toBe(6);
      expect(dryBody.validRowsCount).toBe(3);
      expect(dryBody.createdCount).toBe(0);
      expect(dryBody.updatedCount).toBe(0);
      expect(dryBody.errors).toHaveLength(3);
      expect(dryBody.errors.map((e: { rowNumber: number }) => e.rowNumber)).toEqual([4, 5, 7]);
      expect(dryBody.preview).toHaveLength(3);
      expect(dryBody.preview[0].action).toBe('update');
      expect(dryBody.preview[1].action).toBe('create');
      expect(dryBody.preview[2].action).toBe('create');

      // Comprobamos que dryRun=true NO insertó aún a las personas nuevas
      const listBeforeConfirm = await server.inject({
        method: 'GET',
        url: '/api/v1/people',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(listBeforeConfirm.json()).toHaveLength(1);

      // 4. Confirmamos la importación (dryRun=false)
      const confirmRes = await server.inject({
        method: 'POST',
        url: '/api/v1/people/import',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          csvContent,
          dryRun: false,
        },
      });
      expect(confirmRes.statusCode).toBe(200);
      const confirmBody = confirmRes.json();
      expect(confirmBody.dryRun).toBe(false);
      expect(confirmBody.createdCount).toBe(2);
      expect(confirmBody.updatedCount).toBe(1);
      expect(confirmBody.errors).toHaveLength(3);

      // 5. Verificamos que las 3 personas están en el directorio y que podemos rotar el qrToken
      const listAfterConfirm = await server.inject({
        method: 'GET',
        url: '/api/v1/people',
        headers: { authorization: `Bearer ${token}` },
      });
      const allPeople = listAfterConfirm.json();
      expect(allPeople).toHaveLength(3);

      const firstPerson = allPeople[0];
      const rotateRes = await server.inject({
        method: 'POST',
        url: `/api/v1/people/${firstPerson.id}/rotate-qr`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(rotateRes.statusCode).toBe(200);
      expect(rotateRes.json().qrToken).not.toBe(firstPerson.qrToken);

      await server.close();
    });
  });
}
