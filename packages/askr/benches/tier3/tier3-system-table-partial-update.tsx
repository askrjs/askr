import { bench, describe } from 'vitest';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertTextTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  tier3BenchOptions,
  updateEveryNthRow,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const updatedRows = updateEveryNthRow(initialRows);

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
        label: 'tier3 partial update',
        afterForward: () => {
          assertTextTransition(
            mounted.container,
            'tbody tr:first-child td:nth-child(2) a',
            'Item 1 !!!'
          );
        },
        afterBackward: () => {
          assertTextTransition(
            mounted.container,
            'tbody tr:first-child td:nth-child(2) a',
            'Item 1'
          );
        },
      }
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table partial update', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'update every 10th row in a 1,000-row table',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...tier3BenchOptions,
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
