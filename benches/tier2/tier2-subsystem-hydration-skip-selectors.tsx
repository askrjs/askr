import { bench, describe, expect } from 'vite-plus/test';
import { createHydrationFixture, tier2BenchOptions } from '../shared/_shared';
import { hydrateSPA } from '../../src/boot';
import {
  fireEvent,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

function createSkipSelectorHarness() {
  const state = {
    clicks: [] as string[],
  };

  const routes = [
    {
      path: '/',
      handler: () => (
        <div class="skip-selectors-root">
          <button
            id="skip-live-button"
            onClick={() => {
              state.clicks.push('live');
            }}
          >
            Live
          </button>
          <div class="static-footer">
            <button
              id="skip-static-button"
              onClick={() => {
                state.clicks.push('static');
              }}
            >
              Static
            </button>
          </div>
          <div class="marketing-slot">
            <button
              id="skip-marketing-button"
              onClick={() => {
                state.clicks.push('marketing');
              }}
            >
              Marketing
            </button>
          </div>
        </div>
      ),
    },
  ];

  return { routes, state };
}

await (async () => {
  const harness = createSkipSelectorHarness();
  const fixture = createHydrationFixture({ routes: harness.routes });

  try {
    await expect(
      hydrateSPA({
        root: fixture.container,
        registry: fixture!.registry,
        hydrate: {
          skipSelectors: ['.static-footer', '.marketing-slot'],
        },
      })
    ).resolves.not.toThrow();
    flushScheduler();

    fireEvent.click(
      fixture.container.querySelector('#skip-live-button') as HTMLElement
    );
    fireEvent.click(
      fixture.container.querySelector('#skip-static-button') as HTMLElement
    );
    fireEvent.click(
      fixture.container.querySelector('#skip-marketing-button') as HTMLElement
    );
    flushScheduler();

    expect(harness.state.clicks).toEqual(['live']);
    expect(
      fixture.container
        .querySelector('.static-footer')
        ?.hasAttribute('data-skip-hydrate')
    ).toBe(true);
    expect(
      fixture.container
        .querySelector('.marketing-slot')
        ?.hasAttribute('data-skip-hydrate')
    ).toBe(true);
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration skip selectors', () => {
  let harness: ReturnType<typeof createSkipSelectorHarness> | null = null;
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'hydrate around skipped static islands',
    async () => {
      fixture!.reset();
      await hydrateSPA({
        root: fixture!.container,
        registry: fixture!.registry,
        hydrate: {
          skipSelectors: ['.static-footer', '.marketing-slot'],
        },
      });
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        harness = createSkipSelectorHarness();
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
