import { bench, describe, expect } from 'vite-plus/test';
import { verifyHydrationSyncForUrl } from '../../src/ssr/verify-hydration';
import {
  buildRows,
  buildTableHydrationRoutes,
  createHydrationFixture,
  extendBenchOptions,
  tier2BenchOptions,
} from '../shared/_shared';

const routes = buildTableHydrationRoutes(buildRows(1000));
const verifyMarkupBenchOptions = extendBenchOptions(tier2BenchOptions, {
  time: 1800,
  iterations: 5,
  warmupTime: 250,
  warmupIterations: 1,
});

await (async () => {
  const fixture = createHydrationFixture({ routes });

  try {
    expect(
      verifyHydrationSyncForUrl({
        root: fixture.container,
        url: '/',
        routes: fixture.routes,
      })
    ).toBe(true);
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration verify markup', () => {
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'verify markup for a 1,000-row server-rendered table',
    () => {
      verifyHydrationSyncForUrl({
        root: fixture!.container,
        url: '/',
        routes: fixture!.routes,
      });
    },
    {
      ...verifyMarkupBenchOptions,
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
