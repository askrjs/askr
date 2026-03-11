import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  createHydrationFixture,
  tier2BenchOptions,
} from '../shared/_shared';
import { hydrateSPA } from '../../src/boot';
import { state } from '../../src';
import { fireEvent, flushScheduler } from '../../tests/helpers/test-renderer';

function createInteractiveTableHarness() {
  const initialRows = buildRows(1000);

  const routes = [
    {
      path: '/',
      handler: () => {
        const rows = state(initialRows);
        const selectedId = state<number | null>(null);

        const updateSelected = () => {
          const currentSelected = selectedId();
          if (currentSelected === null) {
            return;
          }

          rows.set(
            rows().map((row) =>
              row.id === currentSelected
                ? { ...row, label: `${row.label} hydrated` }
                : row
            )
          );
        };

        return (
          <div class="interactive-table-root">
            <button id="update-selected" onClick={updateSelected}>
              Update Selected
            </button>
            <table>
              <tbody>
                {rows().map((row) => (
                  <tr
                    id={`table-row-${row.id}`}
                    class={selectedId() === row.id ? 'selected' : ''}
                  >
                    <td>{row.id}</td>
                    <td>
                      <button
                        id={`table-select-${row.id}`}
                        onClick={() => selectedId.set(row.id)}
                      >
                        {row.label}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      },
    },
  ];

  return { routes };
}

await (async () => {
  const harness = createInteractiveTableHarness();
  const fixture = createHydrationFixture({ routes: harness.routes });

  try {
    await expect(
      hydrateSPA({ root: fixture.container, routes: fixture.routes })
    ).resolves.not.toThrow();
    flushScheduler();

    fireEvent.click(
      fixture.container.querySelector('#table-select-500') as HTMLElement
    );
    flushScheduler();
    expect(
      fixture.container
        .querySelector('#table-row-500')
        ?.classList.contains('selected')
    ).toBe(true);

    fireEvent.click(
      fixture.container.querySelector('#update-selected') as HTMLElement
    );
    flushScheduler();
    expect(
      fixture.container.querySelector('#table-select-500')?.textContent
    ).toBe('Item 500 hydrated');
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration interactive table', () => {
  let harness: ReturnType<typeof createInteractiveTableHarness> | null = null;
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'hydrate a 1,000-row interactive table and use it immediately',
    async () => {
      await hydrateSPA({ root: fixture!.container, routes: fixture!.routes });
      fireEvent.click(
        fixture!.container.querySelector('#table-select-500') as HTMLElement
      );
      fireEvent.click(
        fixture!.container.querySelector('#update-selected') as HTMLElement
      );
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        harness = createInteractiveTableHarness();
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
