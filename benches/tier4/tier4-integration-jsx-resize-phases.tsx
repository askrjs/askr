import { bench, describe } from 'vite-plus/test';
import { selector, state, type State } from '../../src';
import { createIsland } from '../../src/boot';
import { BenchmarkTable } from '../../src/bench/components/benchmark-table';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import {
  assertRowCountTransition,
  assertSelectionTransition,
  assertToggleMutationGuard,
  buildRows,
  createCachedElementQuery,
  createDirectionalBenchCycle,
  extendBenchOptions,
  tier4BenchOptions,
  type RowData,
} from '../shared/_shared';

// Keep the JSX row/component path and independent row objects used by the
// bidirectional resize diagnostic. Only the inverse reset is outside timing.
const rows1000 = buildRows(1000);
const rows2000 = buildRows(2000);
const options = extendBenchOptions(tier4BenchOptions, {
  time: 2500,
  iterations: 100,
  warmupTime: 250,
  warmupIterations: 1,
});

function mountSelectedTable(initialRows: RowData[]) {
  const { container, cleanup } = createTestContainer();
  let rows!: State<RowData[]>;
  const primaryLinks = createCachedElementQuery<HTMLElement>(
    container,
    'tbody tr td:nth-child(2) a'
  );
  function App() {
    rows = state(initialRows);
    const selected = state<number | null>(null);
    const isSelected = selector(selected);
    return (
      <div class="container">
        <BenchmarkTable
          rows={rows}
          isSelected={isSelected}
          onSelect={(id) => selected.set(id)}
          onRemove={(id) =>
            rows.set((current) => current.filter((row) => row.id !== id))
          }
        />
      </div>
    );
  }
  createIsland({ root: container, component: App });
  flushScheduler();
  primaryLinks
    .getAt(498)
    .dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  flushScheduler();
  return {
    container,
    cleanup,
    setRows(next: RowData[]) {
      rows.set(next);
      flushScheduler();
      primaryLinks.invalidate();
    },
  };
}

{
  const app = mountSelectedTable(rows1000);
  const retained = app.container.querySelector('tbody tr');
  try {
    assertToggleMutationGuard(
      app.container,
      () => app.setRows(rows2000),
      () => app.setRows(rows1000),
      {
        label: 'directional selected JSX resize',
        afterForward() {
          assertRowCountTransition(app.container, 2000);
          assertSelectionTransition(app.container, 498);
          if (app.container.querySelector('tbody tr') !== retained)
            throw new Error('Growth replaced a retained row');
        },
        afterBackward() {
          assertRowCountTransition(app.container, 1000);
          assertSelectionTransition(app.container, 498);
          if (app.container.querySelector('tbody tr') !== retained)
            throw new Error('Shrink replaced a retained row');
        },
      }
    );
  } finally {
    app.cleanup();
  }
}

describe('tier4 integration JSX resize phases', () => {
  let app: ReturnType<typeof mountSelectedTable> | null = null;
  let cycle: ReturnType<typeof createDirectionalBenchCycle> | null = null;
  const cleanup = () => {
    try {
      cycle?.teardown();
    } finally {
      app?.cleanup();
      app = null;
      cycle = null;
    }
  };

  bench(
    'grow selected JSX rows from 1,000 to 2,000',
    () => cycle!.runForward(),
    {
      ...options,
      setup() {
        app = mountSelectedTable(rows1000);
        cycle = createDirectionalBenchCycle({
          label: 'selected JSX growth',
          forward: () => app!.setRows(rows2000),
          reset: () => app!.setRows(rows1000),
          verifyInitial() {
            assertRowCountTransition(app!.container, 1000);
            assertSelectionTransition(app!.container, 498);
          },
        });
      },
      teardown: cleanup,
    }
  );

  bench(
    'shrink selected JSX rows from 2,000 to 1,000',
    () => cycle!.runForward(),
    {
      ...options,
      setup() {
        app = mountSelectedTable(rows2000);
        cycle = createDirectionalBenchCycle({
          label: 'selected JSX shrink',
          forward: () => app!.setRows(rows1000),
          reset: () => app!.setRows(rows2000),
          verifyInitial() {
            assertRowCountTransition(app!.container, 2000);
            assertSelectionTransition(app!.container, 498);
          },
        });
      },
      teardown: cleanup,
    }
  );
});
