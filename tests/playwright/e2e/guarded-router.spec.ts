import { expect, test } from '@playwright/test';

test.describe('guarded browser routing', () => {
  test('should redirect anonymous users to login and return them to the original target @smoke', async ({
    page,
  }) => {
    await page.goto('/?scenario=guarded');
    await expect(
      page.getByRole('heading', { name: 'Router Home' })
    ).toBeVisible();
    await expect(page.getByTestId('auth-status')).toHaveText('Signed out');

    await page.getByTestId('private-link').click();

    await expect(page).toHaveURL(/\/login\?next=%2Fprivate$/);
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(page.getByTestId('login-next-target')).toHaveText('/private');

    await page.getByTestId('sign-in-viewer').click();

    await expect(page).toHaveURL(/\/private$/);
    await expect(
      page.getByRole('heading', { name: 'Private overview' })
    ).toBeVisible();
    await expect(page.getByTestId('auth-status')).toHaveText(
      'Signed in as Viewer'
    );
  });

  test('should redirect authenticated users away from guest-only routes', async ({
    page,
  }) => {
    await page.goto('/?scenario=guarded');

    await page.getByTestId('private-link').click();
    await page.getByTestId('sign-in-viewer').click();
    await expect(
      page.getByRole('heading', { name: 'Private overview' })
    ).toBeVisible();

    await page.getByTestId('guest-link').click();

    await expect(page).toHaveURL(/\/private$/);
    await expect(
      page.getByRole('heading', { name: 'Private overview' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Guest welcome' })
    ).toHaveCount(0);
  });

  test('should evaluate nested guards outer-to-inner and deny finance content for viewers', async ({
    page,
  }) => {
    await page.goto('/?scenario=guarded');

    await page.getByTestId('finance-link').click();
    await expect(page).toHaveURL(/\/login\?next=%2Freports%2Ffinance$/);
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    await page.getByTestId('sign-in-viewer').click();

    await expect(page).toHaveURL(/\/reports\/finance$/);
    await expect(page.getByText('403')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Finance report' })
    ).toHaveCount(0);
  });

  test('should support browser back and forward across guarded and public pages', async ({
    page,
  }) => {
    await page.goto('/?scenario=guarded');

    await page.getByTestId('private-link').click();
    await page.getByTestId('sign-in-viewer').click();
    await page.getByTestId('home-link').click();

    await expect(
      page.getByRole('heading', { name: 'Public landing' })
    ).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/private$/);
    await expect(
      page.getByRole('heading', { name: 'Private overview' })
    ).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('heading', { name: 'Public landing' })
    ).toBeVisible();
  });

  test('should load authenticated lazy routes after sign-in', async ({
    page,
  }) => {
    await page.goto('/?scenario=guarded');

    await page.getByTestId('private-link').click();
    await page.getByTestId('sign-in-admin').click();
    await page.getByTestId('lazy-success-link').click();

    await expect(page).toHaveURL(/\/lazy-success$/);
    await expect(
      page.getByRole('heading', { name: 'Lazy success' })
    ).toBeVisible();
  });

  test('should recover after a lazy route load failure on reload', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/?scenario=guarded&lazy=fail');

    await page.getByTestId('private-link').click();
    await page.getByTestId('sign-in-admin').click();
    await page.getByTestId('lazy-flaky-link').click();

    await expect.poll(() => pageErrors.length).toBe(1);
    await expect(page).toHaveURL(/\/lazy-flaky$/);
    await expect(pageErrors[0] ?? '').toContain('Lazy route failed to load.');
    await expect(
      page.getByRole('heading', { name: 'Private overview' })
    ).toBeVisible();

    await page.goto('/?scenario=guarded');
    await page.getByTestId('private-link').click();
    await page.getByTestId('sign-in-admin').click();
    await page.getByTestId('lazy-flaky-link').click();

    await expect(page).toHaveURL(/\/lazy-flaky$/);
    await expect(
      page.getByRole('heading', { name: 'Lazy recovery' })
    ).toBeVisible();
  });
});
