import { bench, describe, expect } from 'vite-plus/test';
import { hydrateSPA } from '../../src/boot';
import {
  createHydrationFixture,
  extendBenchOptions,
  stubBelowFoldGeometry,
  tier2BenchOptions,
} from '../shared/_shared';
import {
  fireEvent,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

const belowFoldActivationBenchOptions = extendBenchOptions(tier2BenchOptions, {
  time: 1800,
  iterations: 5,
  warmupTime: 250,
  warmupIterations: 1,
});

function createDeferredBelowFoldHarness() {
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
  const harness = createDeferredBelowFoldHarness();
  const fixture = createHydrationFixture({ routes: harness.routes });

  try {
    await expect(
      hydrateSPA({
        root: fixture.container,
        registry: fixture!.registry,
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
    expect(harness.state.clicks).toEqual(['hero', 'below-599']);
    expect(
      fixture.container
        .querySelector('#below-button-599')
        ?.closest('[data-skip-hydrate]')
    ).toBeNull();

    controller.revealAll();
    window.dispatchEvent(new Event('scroll'));
    flushScheduler();

    fireEvent.click(
      fixture.container.querySelector('#below-button-599') as HTMLElement
    );
    flushScheduler();
    expect(harness.state.clicks).toEqual(['hero', 'below-599', 'below-599']);
  } finally {
    controller.restore();
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration below fold activation', () => {
  let controller: ReturnType<typeof stubBelowFoldGeometry> | null = null;
  let harness: ReturnType<typeof createDeferredBelowFoldHarness> | null = null;
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'hydrate and activate a deferred below-fold subtree',
    async () => {
      await fixture!.reset();
      controller!.restore();
      controller = stubBelowFoldGeometry();
      await hydrateSPA({
        root: fixture!.container,
        registry: fixture!.registry,
        hydrate: { deferBelowFold: true, foldThreshold: 100 },
      });
      flushScheduler();
      controller!.revealAll();
      window.dispatchEvent(new Event('scroll'));
      flushScheduler();
    },
    {
      ...belowFoldActivationBenchOptions,
      setup() {
        controller = stubBelowFoldGeometry();
        harness = createDeferredBelowFoldHarness();
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
