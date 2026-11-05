import { expect, test } from '@playwright/test';

test.describe('Flujo E2E de check-in público sin cuenta (Fase 3)', () => {
  test('registra asistencia desde /c/:code con bloqueo de autorización Ley 1581 y verifica idempotencia en segundo envío', async ({
    page,
    request,
  }) => {
    const adminPassword = process.env['E2E_ADMIN_PASSWORD'] ?? '';

    // 1. Autenticar funcionario por API para crear y abrir un evento de prueba
    const loginRes = await request.post('/api/v1/auth/login', {
      data: {
        email: 'admin@demo.tap',
        password: adminPassword,
      },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { accessToken } = (await loginRes.json()) as { accessToken: string };

    const now = new Date();
    const startsAt = new Date(now.getTime() - 15 * 60_000).toISOString();
    const endsAt = new Date(now.getTime() + 2 * 3600_000).toISOString();

    const createEventRes = await request.post('/api/v1/events', {
      headers: { authorization: `Bearer ${accessToken}` },
      data: {
        name: 'Feria E2E Bienestar Universitario',
        type: 'mass',
        startsAt,
        endsAt,
        allowedIdentificationModes: ['document', 'institutional_code'],
        confirmIdentity: true,
        allowWalkIn: true,
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

    // 2. El participante abre el enlace público del QR `/c/:code` sin tener cuenta
    await page.goto(`/c/${createdEvent.publicCode}`);
    await expect(page.getByTestId('public-event-title')).toHaveText(
      'Feria E2E Bienestar Universitario',
    );

    // 3. Ingresa su documento por primera vez -> despliega formulario walk-in con bloqueo Ley 1581
    await page.getByTestId('checkin-identifier-input').fill('1116443322');
    await page.getByTestId('checkin-submit-btn').click();

    await expect(page.getByTestId('checkin-walkin-section')).toBeVisible();
    await page.getByTestId('walkin-fullname-input').fill('Laura Sofía Andrade');

    // El botón primario permanece bloqueado hasta aceptar la autorización de datos (Ley 1581)
    await expect(page.getByTestId('checkin-submit-btn')).toBeDisabled();
    await page.getByTestId('walkin-consent-checkbox').check();
    await expect(page.getByTestId('checkin-submit-btn')).toBeEnabled();

    await page.getByTestId('checkin-submit-btn').click();

    // 4. Recibe confirmación inmediata de asistencia registrada
    await expect(page.getByTestId('checkin-confirmation-card')).toBeVisible();
    await expect(page.getByTestId('checkin-outcome-badge')).toContainText('Asistencia registrada');

    // 5. Si vuelve a enviar el mismo documento, confirma identidad abreviada («Laura A.») y recibe `already_registered`
    await page.getByTestId('checkin-reset-btn').click();
    await page.getByTestId('checkin-identifier-input').fill('1116443322');
    await page.getByTestId('checkin-submit-btn').click();

    await expect(page.getByTestId('checkin-lookup-confirm-box')).toContainText('Laura A.');
    await expect(page.getByTestId('checkin-lookup-confirm-box')).toContainText('•••3322');
    await page.getByTestId('checkin-submit-btn').click();

    await expect(page.getByTestId('checkin-outcome-badge')).toContainText(
      'Asistencia ya registrada',
    );
  });
});
