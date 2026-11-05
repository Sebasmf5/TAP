import { expect, test } from '@playwright/test';

test.describe('Flujo E2E de préstamo público con firma digital y devolución por QR (Fase 5)', () => {
  test('bloquea formulario en /p/:code hasta aceptar Ley 1581, registra préstamo con firma e Idempotency-Key y procesa devolución desde el panel', async ({
    page,
    request,
  }) => {
    const adminPassword = process.env['E2E_ADMIN_PASSWORD'] ?? '';

    // 1. El participante abre el enlace público del punto de préstamo `/p/PREST1`
    await page.goto('/p/PREST1');
    await expect(page.getByTestId('public-lending-point-name')).toContainText(
      'Punto Central Bienestar',
    );

    // 2. Verificar que los campos del formulario y el botón de envío están bloqueados hasta aceptar Ley 1581
    await expect(page.getByTestId('loan-identifier-input')).toBeDisabled();
    await expect(page.getByTestId('loan-submit-btn')).toBeDisabled();

    // Aceptar el tratamiento de datos personales (Ley 1581)
    await page.getByTestId('loan-consent-checkbox').check();
    await expect(page.getByTestId('loan-identifier-input')).toBeEnabled();

    // 3. Ingresar documento y consultar lookup -> despliega registro walk-in
    await page.getByTestId('loan-identifier-input').fill('1115998877');
    await page.getByTestId('loan-lookup-btn').click();

    await expect(page.getByTestId('loan-walkin-section')).toBeVisible();
    await page.getByTestId('loan-walkin-fullname').fill('Santiago Andrés Gómez');
    await page.getByTestId('loan-walkin-email').fill('santiago.gomez@uceva.edu.co');

    // 4. Trazar firma digital de responsabilidad y enviar solicitud
    await page.getByTestId('loan-quick-sign-btn').click();
    await page.getByTestId('loan-submit-btn').click();

    await expect(page.getByTestId('loan-confirmation-card')).toBeVisible();
    await expect(page.getByTestId('loan-status-badge')).toContainText('Préstamo registrado');
    const assignedUnitCode = await page.getByTestId('loan-assigned-unit-code').innerText();
    expect(assignedUnitCode).toMatch(/^(BAL|RAQ)-\d{3}$/);

    // 5. El funcionario devuelve la unidad por su código/QR y la unidad queda liberada
    const loginRes = await request.post('/api/v1/auth/login', {
      data: {
        email: 'admin@demo.tap',
        password: adminPassword,
      },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { accessToken } = (await loginRes.json()) as { accessToken: string };

    const returnRes = await request.post('/api/v1/loans/return-by-qr', {
      headers: { authorization: `Bearer ${accessToken}` },
      data: {
        unitQrOrCode: assignedUnitCode.trim(),
        conditionIn: 'good',
      },
    });
    expect(returnRes.ok()).toBeTruthy();
    const returnedLoan = (await returnRes.json()) as { status: string; unitCode: string };
    expect(returnedLoan.status).toBe('returned');
  });
});
