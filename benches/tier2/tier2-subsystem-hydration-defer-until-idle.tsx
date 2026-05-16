import { bench, describe, expect } from 'vite-plus/test';
import { hydrateSPA } from '../../src/boot';
import {
  buildWideSsrTree,
  createHydrationFixture,
  tier2BenchOptions,
} from '../shared/_shared';
import {
  fireEvent,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

function createDeferredIdleHydrationHarness() {
  const state = {
    clicks: 0,
  };

  const routes = [
    {
      path: '/',
      handler: () => (
        <div class="idle-hydration-root">
          <button
            id="idle-button"
            onClick={() => {
              state.clicks += 1;
            }}
          >
            Idle
          </button>
          {buildWideSsrTree(600)}
        </div>
      ),
    },
  ];

  return { routes, state };
}

await (async () => {
  const harness = createDeferredIdleHydrationHarness();
  const fixture = createHydrationFixture({ routes: harness.routes });

  try {
    const hydration = hydrateSPA({
      root: fixture.container,
      routes: fixture.routes,
      hydrate: { deferUntilIdle: true },
    });

    fireEvent.click(
      fixture.container.querySelector('#idle-button') as HTMLElement
    );
    expect(harness.state.clicks).toBe(0);

    await hydration;
    flushScheduler();

    fireEvent.click(
      fixture.container.querySelector('#idle-button') as HTMLElement
    );
    flushScheduler();
    expect(harness.state.clicks).toBe(1);
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration defer until idle', () => {
  let harness: ReturnType<typeof createDeferredIdleHydrationHarness> | null =
    null;
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'defer hydration of a wide page until idle',
    async () => {
      fixture!.reset();
      await hydrateSPA({
        root: fixture!.container,
        routes: fixture!.routes,
        hydrate: { deferUntilIdle: true },
      });
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        harness = createDeferredIdleHydrationHarness();
        fixture = createHydrationFixture({ routes: harness.routes });
      },
      teardown() {
        fixture?.cleanup();
        fixture = null;
        harness = null;
      },
    }
  );
});
