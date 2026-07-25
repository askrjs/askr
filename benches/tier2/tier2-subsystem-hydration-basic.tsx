import { bench, describe, expect } from 'vite-plus/test';
import { hydrateSPA } from '../../src/boot';
import { flushScheduler } from '../../test-utils/render/test-renderer';
import {
  buildRows,
  buildTableHydrationRoutes,
  createHydrationFixture,
  extendBenchOptions,
  tier2BenchOptions,
} from '../shared/_shared';

const routes = buildTableHydrationRoutes(buildRows(1000));
const hydrationBasicBenchOptions = extendBenchOptions(tier2BenchOptions, {
  time: 6_000,
  warmupTime: 1_200,
  warmupIterations: 4,
});

await (async () => {
  const fixture = createHydrationFixture({ routes });

  try {
    await expect(
      hydrateSPA({ root: fixture.container, registry: fixture!.registry })
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
      await hydrateSPA({
        root: fixture!.container,
        registry: fixture!.registry,
      });
      flushScheduler();
    },
    {
      ...hydrationBasicBenchOptions,
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
