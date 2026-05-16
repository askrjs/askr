import { bench, describe, expect } from 'vite-plus/test';
import { BenchmarkRow } from '../../src/bench/components/benchmark-row';
import { createIsland } from '../../src/boot';
import { For } from '../../src/control';
import { state, type State } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import {
  assertOrderTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  extendBenchOptions,
  tier2BenchOptions,
  type BenchToggle,
  type RowData,
} from '../shared/_shared';

const initialRows = buildRows(2_000);

function interleaveRows(rows: readonly RowData[]): RowData[] {
  const evenRows: RowData[] = [];
  const oddRows: RowData[] = [];

  // Keep each half ordered so the permutation still has a long LIS.
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (index % 2 === 0) {
      evenRows.push(row);
    } else {
      oddRows.push(row);
    }
  }

  return [...evenRows, ...oddRows];
}

const interleavedRows = interleaveRows(initialRows);
const initialRowIds = initialRows.map((row) => row.id);
const interleavedRowIds = interleavedRows.map((row) => row.id);

const keyedLisBenchOptions = extendBenchOptions(tier2BenchOptions, {
  time: 800,
  iterations: 2,
  warmupTime: 150,
  warmupIterations: 1,
});

const noop = () => undefined;

function TableShell({ rows }: { rows: readonly RowData[] }) {
  return (
    <table class="table table-hover table-striped test-data">
      <tbody>
        <For each={rows} by={(item) => item.id}>
          {(item) => (
            <BenchmarkRow
              item={item}
              isSelected={() => false}
              onSelect={noop}
              onRemove={noop}
            />
          )}
        </For>
      </tbody>
    </table>
  );
}

function createKeyedLisHarness(initial: readonly RowData[]) {
  const result = createTestContainer();
  let rowsState!: State<readonly RowData[]>;

  const App = () => {
    rowsState = state<readonly RowData[]>(initial);
    return <TableShell rows={rowsState()} />;
  };

  createIsland({ root: result.container, component: App });
  flushScheduler();

  return {
    container: result.container,
    cleanup: result.cleanup,
    rowsState,
  };
}

{
  const mounted = createKeyedLisHarness(initialRows);
  const toggle = createRowToggle(initialRows, interleavedRows, 'initial');
  const originalSecondRow = mounted.container.querySelectorAll('tr')[1];

  try {
    assertToggleMutationGuard(
      mounted.container,
      () => {
        mounted.rowsState.set(toggle.next());
        flushScheduler();
      },
      () => {
        mounted.rowsState.set(toggle.next());
        flushScheduler();
      },
      {
        label: 'tier2 keyed LIS prop boundary',
        afterForward: () => {
          expect(mounted.container.querySelectorAll('tr')[1000]).toBe(
            originalSecondRow
          );
          assertOrderTransition(mounted.container, interleavedRowIds);
        },
        afterBackward: () => {
          assertOrderTransition(mounted.container, initialRowIds);
        },
      }
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier2 subsystem keyed lis prop boundary', () => {
  let mounted: ReturnType<typeof createKeyedLisHarness> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'reorder 2,000 keyed rows through a component boundary',
    () => {
      mounted!.rowsState.set(toggle!.next());
      flushScheduler();
    },
    {
      ...keyedLisBenchOptions,
      setup() {
        mounted = createKeyedLisHarness(initialRows);
        toggle = createRowToggle(initialRows, interleavedRows, 'initial');
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        toggle = null;
      },
    }
  );
});
