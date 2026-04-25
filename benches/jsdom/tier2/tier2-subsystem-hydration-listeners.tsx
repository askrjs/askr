import { bench, describe, expect } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import {
  createHydrationFixture,
  noisyTier2BenchOptions,
} from '../../shared/_shared';
import {
  fireEvent,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function createListenerHarness() {
  const state = {
    clicks: 0,
    lastInput: '',
    lastSelect: '',
  };

  const routes = [
    {
      path: '/',
      handler: () => (
        <div class="listener-heavy-root">
          <section class="listener-buttons">
            {Array.from({ length: 250 }, (_, index) => (
              <button
                id={`listener-button-${index}`}
                onClick={() => {
                  state.clicks += 1;
                }}
              >
                Button {index}
              </button>
            ))}
          </section>
          <section class="listener-inputs">
            {Array.from({ length: 100 }, (_, index) => (
              <input
                id={`listener-input-${index}`}
                value={`seed-${index}`}
                onInput={(event: Event) => {
                  state.lastInput = (event.target as HTMLInputElement).value;
                }}
              />
            ))}
          </section>
          <section class="listener-selects">
            {Array.from({ length: 50 }, (_, index) => (
              <select
                id={`listener-select-${index}`}
                onChange={(event: Event) => {
                  state.lastSelect = (event.target as HTMLSelectElement).value;
                }}
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

  return { routes, state };
}

await (async () => {
  const harness = createListenerHarness();
  const fixture = createHydrationFixture({ routes: harness.routes });
  const serverHtml = fixture.container.innerHTML.toLowerCase();

  try {
    expect(serverHtml).not.toContain('onclick');
    expect(serverHtml).not.toContain('oninput');
    expect(serverHtml).not.toContain('onchange');

    await expect(
      hydrateSPA({ root: fixture.container, routes: fixture.routes })
    ).resolves.not.toThrow();
    flushScheduler();

    fireEvent.click(
      fixture.container.querySelector('#listener-button-123') as HTMLElement
    );
    fireEvent.input(
      fixture.container.querySelector('#listener-input-50') as HTMLInputElement,
      'hydrated-input'
    );

    const select = fixture.container.querySelector(
      '#listener-select-25'
    ) as HTMLSelectElement;
    select.value = 'option-2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushScheduler();

    expect(harness.state.clicks).toBe(1);
    expect(harness.state.lastInput).toBe('hydrated-input');
    expect(harness.state.lastSelect).toBe('option-2');
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration listeners', () => {
  let harness: ReturnType<typeof createListenerHarness> | null = null;
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'hydrate a listener-heavy interactive tree',
    async () => {
      fixture!.reset();
      await hydrateSPA({ root: fixture!.container, routes: fixture!.routes });
      flushScheduler();
    },
    {
      ...noisyTier2BenchOptions,
      setup() {
        harness = createListenerHarness();
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
