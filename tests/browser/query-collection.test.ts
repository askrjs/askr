import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { loadBrowserHarness, mockJsonFetch } from './_helpers';

test('should load a dynamic schema collection with bounded browser work', async () => {
  const started: string[] = [];
  const releases = new Map<string, () => void>();
  let active = 0;
  let maxActive = 0;

  mockJsonFetch((request) => {
    const database = new URL(request.url).pathname.split('/').at(-1)!;
    started.push(database);
    active += 1;
    maxActive = Math.max(maxActive, active);

    return new Promise<Response>((resolve) => {
      releases.set(database, () => {
        active -= 1;
        resolve(
          new Response(JSON.stringify({ database, tables: database.length }), {
            headers: { 'content-type': 'application/json' },
          })
        );
      });
    });
  });

  const app = await loadBrowserHarness();
  app.mountQueryCollectionScenario();

  await expect.poll(() => started).toEqual(['postgres', 'analytics']);
  expect(maxActive).toBe(2);

  releases.get('postgres')?.();
  await expect
    .poll(() => started)
    .toEqual(['postgres', 'analytics', 'warehouse']);
  expect(maxActive).toBe(2);

  releases.get('analytics')?.();
  releases.get('warehouse')?.();
  await expect
    .element(page.getByTestId('collection-status'))
    .toHaveTextContent('Settled');
  await expect.element(page.getByText('warehouse:9')).toBeVisible();

  await page.getByRole('button', { name: 'Add archive database' }).click();
  await expect.poll(() => started.at(-1)).toBe('archive');
  releases.get('archive')?.();

  await expect.element(page.getByText('archive:7')).toBeVisible();
  await expect
    .element(page.getByTestId('collection-status'))
    .toHaveTextContent('Settled');
});
