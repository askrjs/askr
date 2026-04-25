import { bench, describe, expect } from 'vite-plus/test';
import {
  createHydrationFixture,
  stubBelowFoldGeometry,
  tier2BenchOptions,
} from '../../shared/_shared';
import { hydrateSPA } from '../../../src/boot';
import {
  fireEvent,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function createDeferredHydrationHarness() {
  const state = {
    clicks: [] as string[],
  };

  const routes = [
    {
      path: '/',
      handler: () => (
        <div class="deferred-root">
          <section class="hero">
            <button
              id="hero-button"
              onClick={() => {
                state.clicks.push('hero');
              }}
            >
              Hero
            </button>
          </section>
          <section class="below-fold">
            {Array.from({ length: 600 }, (_, index) => (
              <button
                id={`below-button-${index}`}
                onClick={() => {
                  state.clicks.push(`below-${index}`);
                }}
              >
                Below {index}
              </button>
            ))}
          </section>
        </div>
      ),
    },
  ];

  return { routes, state };
}

await (async () => {
  const controller = stubBelowFoldGeometry();
  const harness = createDeferredHydrationHarness();
  const fixture = createHydrationFixture({ routes: harness.routes });

  try {
    await expect(
      hydrateSPA({
        root: fixture.container,
        routes: fixture.routes,
        hydrate: { deferBelowFold: true, foldThreshold: 100 },
      })
    ).resolves.not.toThrow();
    flushScheduler();

    fireEvent.click(
      fixture.container.querySelector('#hero-button') as HTMLElement
    );
    fireEvent.click(
      fixture.container.querySelector('#below-button-599') as HTMLElement
    );
    flushScheduler();
    expect(harness.state.clicks).toEqual(['hero']);

    controller.revealAll();
    window.dispatchEvent(new Event('scroll'));
    flushScheduler();

    fireEvent.click(
      fixture.container.querySelector('#below-button-599') as HTMLElement
    );
    flushScheduler();
    expect(harness.state.clicks).toEqual(['hero', 'below-599']);
  } finally {
    controller.restore();
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration deferred', () => {
  let controller: ReturnType<typeof stubBelowFoldGeometry> | null = null;
  let harness: ReturnType<typeof createDeferredHydrationHarness> | null = null;
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'hydrate visible shell then activate a deferred below-fold subtree',
    async () => {
      fixture!.reset();
      await hydrateSPA({
        root: fixture!.container,
        routes: fixture!.routes,
        hydrate: { deferBelowFold: true, foldThreshold: 100 },
      });
      flushScheduler();
      controller!.revealAll();
      window.dispatchEvent(new Event('scroll'));
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        controller = stubBelowFoldGeometry();
        harness = createDeferredHydrationHarness();
        fixture = createHydrationFixture({ routes: harness.routes });
      },
      teardown() {
        controller?.restore();
        controller = null;
        fixture?.cleanup();
        fixture = null;
        harness = null;
      },
    }
  );
});
