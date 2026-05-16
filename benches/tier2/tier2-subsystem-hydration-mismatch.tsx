import { bench, describe, expect } from 'vite-plus/test';
import { hydrateSPA } from '../../src/boot';
import {
  buildRows,
  buildTableHydrationRoutes,
  createHydrationFixture,
  tier2BenchOptions,
} from '../shared/_shared';

const routes = buildTableHydrationRoutes(buildRows(1000));

await (async () => {
  const fixture = createHydrationFixture({
    routes,
    mutateServerHtml(container) {
      const labelCell = container.querySelector('.col-label');
      if (labelCell) {
        labelCell.textContent = 'Mismatch row';
      }
    },
  });

  try {
    await expect(
      hydrateSPA({
        root: fixture.container,
        routes: fixture.routes,
        hydrate: { verifyMarkup: true },
      })
    ).rejects.toThrow(/Hydration mismatch/i);
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration mismatch', () => {
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'reject hydration when one server cell differs',
    async () => {
      await hydrateSPA({
        root: fixture!.container,
        routes: fixture!.routes,
        hydrate: { verifyMarkup: true },
      }).catch(() => undefined);
    },
    {
      ...tier2BenchOptions,
      setup() {
        fixture = createHydrationFixture({
          routes,
          mutateServerHtml(container) {
            const labelCell = container.querySelector('.col-label');
            if (labelCell) {
              labelCell.textContent = 'Mismatch row';
            }
          },
        });
      },
      teardown() {
        fixture?.cleanup();
        fixture = null;
      },
    }
  );
});
