import { bench, describe } from 'vite-plus/test';
import { hydrateSPA } from '../../src/boot';
import {
  createHydrationFixture,
  extendBenchOptions,
  tier3BenchOptions,
} from '../shared/_shared';
import { flushScheduler } from '../../test-utils/render/test-renderer';

const hydrationListenerBenchOptions = extendBenchOptions(tier3BenchOptions, {
  time: 1800,
  iterations: 5,
  warmupTime: 250,
  warmupIterations: 1,
});

function createListenerRoutes() {
  return [
    {
      path: '/',
      handler: () => (
        <div class="listener-heavy-root">
          <section class="listener-buttons">
            {Array.from({ length: 250 }, (_, index) => (
              <button id={`listener-button-${index}`} onClick={() => undefined}>
                Button {index}
              </button>
            ))}
          </section>
          <section class="listener-inputs">
            {Array.from({ length: 100 }, (_, index) => (
              <input
                id={`listener-input-${index}`}
                value={`seed-${index}`}
                onInput={() => undefined}
              />
            ))}
          </section>
          <section class="listener-selects">
            {Array.from({ length: 50 }, (_, index) => (
              <select
                id={`listener-select-${index}`}
                onChange={() => undefined}
              >
                <option value="option-0">Option 0</option>
                <option value="option-1">Option 1</option>
                <option value="option-2">Option 2</option>
              </select>
            ))}
          </section>
        </div>
      ),
    },
  ];
}

describe('tier3 system hydration listeners', () => {
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'hydrate a listener-heavy intrinsic SSR tree in Chromium',
    async () => {
      fixture!.reset();
      await hydrateSPA({ root: fixture!.container, routes: fixture!.routes });
      flushScheduler();
    },
    {
      ...hydrationListenerBenchOptions,
      setup() {
        const routes = createListenerRoutes();
        fixture = createHydrationFixture({ routes });
      },
      teardown() {
        fixture?.cleanup();
        fixture = null;
      },
    }
  );
});
