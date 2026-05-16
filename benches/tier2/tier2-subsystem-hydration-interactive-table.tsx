import { bench, describe, expect } from 'vite-plus/test';
import {
  buildRows,
  createHydrationFixture,
  tier2BenchOptions,
} from '../shared/_shared';
import { hydrateSPA } from '../../src/boot';
import { state } from '../../src';
import {
  fireEvent,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import { For } from '../../src';

function createInteractiveTableHarness() {
  const initialRows = buildRows(250);

  const Row = ({
    row,
    selectRow,
  }: {
    row: { id: number; label: string };
    selectRow: (id: number) => void;
  }) => (
    <tr id={`table-row-${row.id}`}>
      <td>{row.id}</td>
      <td>
        <button id={`table-select-${row.id}`} onClick={() => selectRow(row.id)}>
          {row.label}
        </button>
      </td>
    </tr>
  );

  const routes = [
    {
      path: '/',
      handler: () => {
        const rows = state(initialRows);
        const selectedId = state<number | null>(null);
        const selectRow = (id: number) => selectedId.set(id);

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
            <p id="selected">{selectedId() ?? 'none'}</p>
            <button id="update-selected" onClick={updateSelected}>
              Update Selected
            </button>
            <table>
              <tbody>
                <For each={rows} by={(row) => row.id}>
                  {(row) => <Row row={row} selectRow={selectRow} />}
                </For>
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
    flushScheduler();

    fireEvent.click(
      fixture.container.querySelector('#table-select-125') as HTMLElement
    );
    flushScheduler();
    flushScheduler();
    expect(fixture.container.querySelector('#selected')?.textContent).toBe(
      '125'
    );

    fireEvent.click(
      fixture.container.querySelector('#update-selected') as HTMLElement
    );
    flushScheduler();
    expect(
      fixture.container.querySelector('#table-select-125')?.textContent
    ).toBe('Item 125 hydrated');
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration interactive table', () => {
  bench(
    'hydrate a 250-row interactive table and use it immediately',
    async () => {
      const harness = createInteractiveTableHarness();
      const fixture = createHydrationFixture({ routes: harness.routes });

      try {
        await hydrateSPA({ root: fixture.container, routes: fixture.routes });
        flushScheduler();
        flushScheduler();
        fireEvent.click(
          fixture.container.querySelector('#table-select-125') as HTMLElement
        );
        flushScheduler();
        flushScheduler();
        fireEvent.click(
          fixture.container.querySelector('#update-selected') as HTMLElement
        );
        flushScheduler();
      } finally {
        fixture.cleanup();
      }
    },
    tier2BenchOptions
  );
});
