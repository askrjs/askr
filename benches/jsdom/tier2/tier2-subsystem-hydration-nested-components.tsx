import { bench, describe, expect } from 'vite-plus/test';
import {
  createHydrationFixture,
  tier2BenchOptions,
} from '../../shared/_shared';
import { hydrateSPA } from '../../../src/boot';
import { state } from '../../../src';
import {
  fireEvent,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function createNestedHydrationHarness() {
  const Panel = ({
    panelIndex,
    setAction,
    setInput,
  }: {
    panelIndex: number;
    setAction: (value: string) => void;
    setInput: (value: string) => void;
  }) => (
    <section class="dashboard-panel" id={`panel-${panelIndex}`}>
      <h2>Panel {panelIndex}</h2>
      {Array.from({ length: 5 }, (_, widgetIndex) => (
        <div
          class="dashboard-widget"
          id={`widget-${panelIndex}-${widgetIndex}`}
        >
          <h3>Widget {widgetIndex}</h3>
          <input
            id={`nested-input-${panelIndex}-${widgetIndex}`}
            value={`seed-${panelIndex}-${widgetIndex}`}
            onInput={(event: Event) =>
              setInput((event.target as HTMLInputElement).value)
            }
          />
          <div class="widget-controls">
            {Array.from({ length: 4 }, (_, controlIndex) => (
              <button
                id={`nested-button-${panelIndex}-${widgetIndex}-${controlIndex}`}
                onClick={() =>
                  setAction(`${panelIndex}-${widgetIndex}-${controlIndex}`)
                }
              >
                Control {controlIndex}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );

  const routes = [
    {
      path: '/',
      handler: () => {
        const lastAction = state('idle');
        const lastInput = state('seed');

        return (
          <div class="dashboard-root">
            <header>Hydrated Dashboard</header>
            {Array.from({ length: 5 }, (_, panelIndex) => (
              <Panel
                panelIndex={panelIndex}
                setAction={(value) => lastAction.set(value)}
                setInput={(value) => lastInput.set(value)}
              />
            ))}
            <output id="nested-summary">
              {lastAction()}|{lastInput()}
            </output>
          </div>
        );
      },
    },
  ];

  return { routes };
}

await (async () => {
  const harness = createNestedHydrationHarness();
  const fixture = createHydrationFixture({ routes: harness.routes });

  try {
    await expect(
      hydrateSPA({ root: fixture.container, routes: fixture.routes })
    ).resolves.not.toThrow();
    flushScheduler();

    fireEvent.click(
      fixture.container.querySelector('#nested-button-2-3-1') as HTMLElement
    );
    fireEvent.input(
      fixture.container.querySelector('#nested-input-2-3') as HTMLInputElement,
      'nested-updated'
    );
    flushScheduler();

    expect(
      fixture.container.querySelector('#nested-summary')?.textContent
    ).toContain('2-3-1');
    expect(
      fixture.container.querySelector('#nested-summary')?.textContent
    ).toContain('nested-updated');
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration nested components', () => {
  let harness: ReturnType<typeof createNestedHydrationHarness> | null = null;
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'hydrate a nested dashboard component tree',
    async () => {
      fixture!.reset();
      await hydrateSPA({ root: fixture!.container, routes: fixture!.routes });
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        harness = createNestedHydrationHarness();
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
