import { expect, test } from '@playwright/test';

test.describe('Flujo E2E de emisión, verificación pública y revocación de certificado (Fase 4)', () => {
  test('emite certificado tras asistencia, verifica autenticidad en /v/:code sin exponer documento y refleja revocación inmediata', async ({
    page,
    request,
  }) => {
    const adminPassword = process.env['E2E_ADMIN_PASSWORD'] ?? '';

    // 1. Autenticar funcionario para preparar evento con regla de certificado y registrar asistencia
    const loginRes = await request.post('/api/v1/auth/login', {
      data: {
        email: 'admin@demo.tap',
        password: adminPassword,
      },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { accessToken } = (await loginRes.json()) as { accessToken: string };

    const now = new Date();
    const startsAt = new Date(now.getTime() - 20 * 60_000).toISOString();
    const endsAt = new Date(now.getTime() + 2 * 3600_000).toISOString();

    const createEventRes = await request.post('/api/v1/events', {
      headers: { authorization: `Bearer ${accessToken}` },
      data: {
        name: 'Seminario E2E de Liderazgo Universitario',
        type: 'mass',
        startsAt,
        endsAt,
        allowedIdentificationModes: ['document'],
        confirmIdentity: false,
        allowWalkIn: true,
        certificateRule: {
          type: 'any_attendance',
          hours: 8,
        },
      },
    });
    expect(createEventRes.ok()).toBeTruthy();
    const createdEvent = (await createEventRes.json()) as { id: string; publicCode: string };

    await request.post(`/api/v1/events/${createdEvent.id}/publish`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    await request.post(`/api/v1/events/${createdEvent.id}/open`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Registrar un participante con documento 1099887766
    const checkinRes = await request.post(`/api/v1/public/checkin/${createdEvent.publicCode}`, {
      data: {
        identificationMode: 'document',
        identifier: '1099887766',
        walkInRegistration: {
          documentType: 'CC',
          documentNumber: '1099887766',
          fullName: 'Daniela Fernanda Ríos',
          email: 'daniela.rios@uceva.edu.co',
          acceptedDataConsent: true,
        },
      },
    });
    expect(checkinRes.ok()).toBeTruthy();
    const checkinBody = (await checkinRes.json()) as { outcome: string };
    expect(checkinBody.outcome).toBe('registered');

    // 2. Emitir certificados en lote
    const issueRes = await request.post(`/api/v1/events/${createdEvent.id}/certificates/issue`, {
      headers: { authorization: `Bearer ${accessToken}` },
      data: {
        hours: '8',
      },
    });
    expect(issueRes.ok()).toBeTruthy();
    const issuedPayload = (await issueRes.json()) as {
      issuedCount: number;
      certificates: Array<{ id: string; code: string }>;
    };
    expect(issuedPayload.issuedCount).toBe(1);
    const cert = issuedPayload.certificates[0]!;

    // 3. Consultar la página pública `/v/:code` sin sesión y verificar autenticidad y privacidad (Ley 1581)
    await page.goto(`/v/${cert.code}`);
    await expect(page.getByTestId('verify-valid-card')).toBeVisible();
    await expect(page.getByTestId('verify-status-badge')).toContainText(
      'Certificado auténtico y vigente',
    );
    await expect(page.getByTestId('verify-holder-name')).toHaveText('Daniela Fernanda Ríos');
    await expect(page.getByTestId('verify-event-name')).toHaveText(
      'Seminario E2E de Liderazgo Universitario',
    );

    // Asegurar que la página pública jamás expone el documento completo del titular
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('1099887766');

    // 4. Revocar el certificado y verificar que `/v/:code` refleja el estado revocado y su motivo
    const revokeRes = await request.post(`/api/v1/certificates/${cert.id}/revoke`, {
      headers: { authorization: `Bearer ${accessToken}` },
      data: {
        reason: 'Inconsistencia verificada en el acta de cierre del seminario',
      },
    });
    expect(revokeRes.ok()).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId('verify-revoked-card')).toBeVisible();
    await expect(page.getByTestId('verify-status-badge')).toContainText('Certificado revocado');
    await expect(page.getByTestId('verify-revocation-box')).toContainText(
      'Inconsistencia verificada en el acta de cierre del seminario',
    );
  });
});
