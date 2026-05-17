import { bench, describe } from 'vite-plus/test';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertOrderTransition,
  assertTextTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  extendBenchOptions,
  mountTableBenchmark,
  tier2BenchOptions,
  updateEveryNthRow,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const updatedRows = updateEveryNthRow(initialRows);
const initialRowIds = initialRows.map((row) => row.id);
const stableUpdateBenchOptions = extendBenchOptions(tier2BenchOptions, {
  time: 6_000,
  warmupTime: 1_200,
  warmupIterations: 4,
});

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createRowToggle(initialRows, updatedRows, 'initial');

    assertToggleMutationGuard(
      mounted.container,
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      {
        label: 'tier2 stable update',
        afterForward: () => {
          assertTextTransition(
            mounted.container,
            'tbody tr:first-child td:nth-child(2) a',
            'Item 1 !!!'
          );
          assertTextTransition(
            mounted.container,
            'tbody tr:nth-child(11) td:nth-child(2) a',
            'Item 11 !!!'
          );
          assertOrderTransition(mounted.container, initialRowIds);
        },
        afterBackward: () => {
          assertTextTransition(
            mounted.container,
            'tbody tr:first-child td:nth-child(2) a',
            'Item 1'
          );
          assertTextTransition(
            mounted.container,
            'tbody tr:nth-child(11) td:nth-child(2) a',
            'Item 11'
          );
          assertOrderTransition(mounted.container, initialRowIds);
        },
      }
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier2 subsystem stable update', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'update every 10th row without reordering keys',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...stableUpdateBenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
        toggle = createRowToggle(initialRows, updatedRows, 'initial');
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        toggle = null;
      },
    }
  );
});
