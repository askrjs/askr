import { bench, describe, expect } from 'vite-plus/test';
import { BenchmarkRow } from '../../src/bench/components/benchmark-row';
import { createIsland } from '../../src/boot';
import { For } from '../../src/control';
import { state, type State } from '../../src';
import {
  assertOrderTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  extendBenchOptions,
  tier3BenchOptions,
  type BenchToggle,
  type RowData,
} from '../shared/_shared';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

const initialRows = buildRows(2_000);

function interleaveRows(rows: readonly RowData[]): RowData[] {
  const evenRows: RowData[] = [];
  const oddRows: RowData[] = [];

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

const componentBoundaryBenchOptions = extendBenchOptions(tier3BenchOptions, {
  time: 1_800,
  iterations: 3,
  warmupTime: 250,
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

function createKeyedBoundaryHarness(initial: readonly RowData[]) {
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
  const mounted = createKeyedBoundaryHarness(initialRows);
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
        label: 'tier3 keyed LIS component boundary',
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

describe('tier3 system keyed LIS component boundary', () => {
  let mounted: ReturnType<typeof createKeyedBoundaryHarness> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'reorder 2,000 keyed rows through a component boundary',
    () => {
      mounted!.rowsState.set(toggle!.next());
      flushScheduler();
    },
    {
      ...componentBoundaryBenchOptions,
      setup() {
        mounted = createKeyedBoundaryHarness(initialRows);
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
