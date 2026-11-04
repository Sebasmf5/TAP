import { expect, test } from '@playwright/test';

test.describe('Flujo E2E de inicio y cierre de sesión (Fase 1)', () => {
  test('inicia sesión, conserva sesión tras recargar sin usar localStorage y cierra sesión', async ({
    page,
  }) => {
    const adminPassword = process.env['E2E_ADMIN_PASSWORD'] ?? '';

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Inicia sesión en tu entidad' })).toBeVisible();

    await page.locator('input[name="email"]').fill('admin@demo.tap');
    await page.locator('input[name="password"]').fill(adminPassword);
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId('dashboard-heading')).toContainText('Coordinación Bienestar');

    // Verifica que localStorage NO contiene ningún token JWT (solo preferencia de tema opcional)
    const storageKeys = await page.evaluate(() => Object.keys(window.localStorage));
    for (const key of storageKeys) {
      expect(key.toLowerCase()).not.toContain('token');
      expect(key.toLowerCase()).not.toContain('jwt');
    }

    // Al recargar la página, restaura la sesión mediante /api/v1/auth/refresh (cookie HttpOnly)
    await page.reload();
    await expect(page.getByTestId('dashboard-heading')).toContainText('Coordinación Bienestar');

    // Cierra sesión y redirige a /login
    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
