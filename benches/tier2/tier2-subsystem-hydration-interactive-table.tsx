import { bench, describe, expect } from 'vite-plus/test';
import { BenchmarkTable } from '../../src/bench/components/benchmark-table';
import { hydrateSPA } from '../../src/boot';
import { selector, state, type State } from '../../src';
import {
  buildRows,
  createCachedElementQuery,
  createHydrationFixture,
  tier2BenchOptions,
  type CachedElementQuery,
  type RowData,
} from '../shared/_shared';
import {
  fireEvent,
  flushScheduler,
  waitForNextEvaluation,
} from '../../test-utils/render/test-renderer';

function createInteractiveTableHarness() {
  const initialRows = buildRows(250);
  let rowsState!: State<RowData[]>;
  let selectedState!: State<number | null>;

  const routes = [
    {
      path: '/',
      handler: () => {
        rowsState = state(initialRows);
        selectedState = state<number | null>(null);
        rowsState._hasBeenRead = true;

        const isSelected = selector(selectedState);

        const updateSelected = () => {
          const currentSelected = selectedState();
          if (currentSelected === null) {
            return;
          }

          rowsState.set((rows) =>
            rows.map((row) => {
              if (row.id !== currentSelected) {
                return row;
              }

              const hydrated = row.label.endsWith(' hydrated');
              return {
                ...row,
                label: hydrated
                  ? row.label.slice(0, -10)
                  : `${row.label} hydrated`,
              };
            })
          );
        };

        const remove = (id: number) => {
          rowsState.set((rows) => rows.filter((row) => row.id !== id));
          selectedState.set((selected) => (selected === id ? null : selected));
        };

        return (
          <div class="interactive-table-root">
            <p id="selected">{selectedState() ?? 'none'}</p>
            <button id="update-selected" onClick={updateSelected}>
              Update Selected
            </button>
            <BenchmarkTable
              rows={rowsState}
              isSelected={isSelected}
              onSelect={(id) => selectedState.set(id)}
              onRemove={remove}
            />
          </div>
        );
      },
    },
  ];

  return { routes };
}

const selectedRowIndices = [124, 125] as const;

function createRowLinkQuery(
  container: ParentNode
): CachedElementQuery<HTMLElement> {
  return createCachedElementQuery<HTMLElement>(
    container,
    'tbody tr td:nth-child(2) a'
  );
}

await (async () => {
  const harness = createInteractiveTableHarness();
  const fixture = createHydrationFixture({ routes: harness.routes });
  let rowLinks = createRowLinkQuery(fixture.container);

  try {
    await expect(
      hydrateSPA({ root: fixture.container, registry: fixture!.registry })
    ).resolves.not.toThrow();
    flushScheduler();
    await waitForNextEvaluation();

    rowLinks = createRowLinkQuery(fixture.container);
    fireEvent.click(rowLinks.getAt(selectedRowIndices[0]));
    flushScheduler();
    await waitForNextEvaluation();
    expect(fixture.container.querySelector('#selected')?.textContent).toBe(
      '125'
    );

    fireEvent.click(
      fixture.container.querySelector('#update-selected') as HTMLElement
    );
    flushScheduler();
    await waitForNextEvaluation();
    expect(rowLinks.getAt(selectedRowIndices[0]).textContent).toBe(
      'Item 125 hydrated'
    );
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration interactive table', () => {
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;
  let rowLinks: CachedElementQuery<HTMLElement> | null = null;
  let selectedRowCursor = 0;

  bench(
    'interact with an already hydrated 250-row interactive table',
    async () => {
      const updateSelected = fixture!.container.querySelector(
        '#update-selected'
      ) as HTMLElement;

      fireEvent.click(rowLinks!.getAt(selectedRowIndices[selectedRowCursor]));
      flushScheduler();
      fireEvent.click(updateSelected);
      flushScheduler();

      selectedRowCursor = selectedRowCursor === 0 ? 1 : 0;
    },
    {
      ...tier2BenchOptions,
      async setup() {
        const harness = createInteractiveTableHarness();
        fixture = createHydrationFixture({ routes: harness.routes });

        await hydrateSPA({
          root: fixture.container,
          registry: fixture!.registry,
        });
        flushScheduler();
        await waitForNextEvaluation();
        rowLinks = createRowLinkQuery(fixture.container);
        selectedRowCursor = 0;
      },
      teardown() {
        fixture?.cleanup();
        fixture = null;
        rowLinks = null;
        selectedRowCursor = 0;
      },
    }
  );
});
