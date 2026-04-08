import { bench, describe, expect } from 'vite-plus/test';
import { hydrateSPA } from '../../src/boot';
import { flushScheduler } from '../../tests/helpers/test-renderer';
import {
  buildRows,
  buildTableHydrationRoutes,
  createHydrationFixture,
  tier2BenchOptions,
} from '../shared/_shared';

const routes = buildTableHydrationRoutes(buildRows(1000));

await (async () => {
  const fixture = createHydrationFixture({ routes });

  try {
    await expect(
      hydrateSPA({ root: fixture.container, routes: fixture.routes })
    ).resolves.not.toThrow();
    flushScheduler();
    expect(fixture.container.querySelectorAll('tr')).toHaveLength(1000);
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration basic', () => {
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'hydrate a 1,000-row server-rendered table',
    async () => {
      fixture!.reset();
      await hydrateSPA({ root: fixture!.container, routes: fixture!.routes });
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        fixture = createHydrationFixture({ routes });
      },
      teardown() {
        fixture?.cleanup();
        fixture = null;
      },
    }
  );
});
