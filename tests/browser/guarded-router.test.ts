import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness, setBrowserLocation } from './_helpers';

test.describe('guarded browser routing', () => {
  test('should redirect anonymous users to login and return them to the original target @smoke', async () => {
    setBrowserLocation('/');
    const app = await loadBrowserHarness();
    await app.mountGuardedRouterScenario();

    await expect(
      page.getByRole('heading', { name: 'Router Home' })
    ).toBeVisible();
    await expect
      .element(page.getByTestId('auth-status'))
      .toHaveTextContent('Signed out');

    await page.getByTestId('private-link').click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/login?next=%2Fprivate');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect
      .element(page.getByTestId('login-next-target'))
      .toHaveTextContent('/private');

    await page.getByTestId('sign-in-viewer').click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/private');
    await expect(
      page.getByRole('heading', { name: 'Private overview' })
    ).toBeVisible();
    await expect
      .element(page.getByTestId('auth-status'))
      .toHaveTextContent('Signed in as Viewer');
  });

  test('should redirect authenticated users away from guest-only routes', async () => {
    setBrowserLocation('/');
    const app = await loadBrowserHarness();
    await app.mountGuardedRouterScenario();

    await page.getByTestId('private-link').click();
    await page.getByTestId('sign-in-viewer').click();
    await expect(
      page.getByRole('heading', { name: 'Private overview' })
    ).toBeVisible();

    await page.getByTestId('guest-link').click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/private');
    await expect(
      page.getByRole('heading', { name: 'Private overview' })
    ).toBeVisible();
    await expect
      .poll(
        () =>
          page.getByRole('heading', { name: 'Guest welcome' }).elements().length
      )
      .toBe(0);
  });

  test('should evaluate nested guards outer-to-inner and deny finance content for viewers', async () => {
    setBrowserLocation('/');
    const app = await loadBrowserHarness();
    await app.mountGuardedRouterScenario();

    await page.getByTestId('finance-link').click();
    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/login?next=%2Freports%2Ffinance');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    await page.getByTestId('sign-in-viewer').click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/reports/finance');
    await expect(page.getByText('403')).toBeVisible();
    await expect
      .poll(
        () =>
          page.getByRole('heading', { name: 'Finance report' }).elements()
            .length
      )
      .toBe(0);
  });

  test('should support browser back and forward across guarded and public pages', async () => {
    setBrowserLocation('/');
    const app = await loadBrowserHarness();
    await app.mountGuardedRouterScenario();

    await page.getByTestId('private-link').click();
    await page.getByTestId('sign-in-viewer').click();
    await page.getByTestId('home-link').click();

    await expect(
      page.getByRole('heading', { name: 'Public landing' })
    ).toBeVisible();

    window.history.back();
    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/private');
    await expect(
      page.getByRole('heading', { name: 'Private overview' })
    ).toBeVisible();

    window.history.forward();
    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/');
    await expect(
      page.getByRole('heading', { name: 'Public landing' })
    ).toBeVisible();
  });

  test('should load authenticated lazy routes after sign-in', async () => {
    setBrowserLocation('/');
    const app = await loadBrowserHarness();
    await app.mountGuardedRouterScenario();

    await page.getByTestId('private-link').click();
    await page.getByTestId('sign-in-admin').click();
    await page.getByTestId('lazy-success-link').click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/lazy-success');
    await expect(
      page.getByRole('heading', { name: 'Lazy success' })
    ).toBeVisible();
  });

  test('should return to guest redirect behavior after signing out', async () => {
    setBrowserLocation('/');
    const app = await loadBrowserHarness();
    await app.mountGuardedRouterScenario();

    await page.getByTestId('private-link').click();
    await page.getByTestId('sign-in-viewer').click();
    await expect(page.getByRole('heading', { name: 'Private overview' })).toBeVisible();

    await page.getByTestId('sign-out-link').click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/');
    await expect(page.getByRole('heading', { name: 'Public landing' })).toBeVisible();

    await page.getByTestId('private-link').click();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe('/login?next=%2Fprivate');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  });
});
