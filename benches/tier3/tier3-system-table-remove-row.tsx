import { bench, describe } from 'vite-plus/test';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertRowCountTransition,
  assertTextTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  removeRowById,
  tier3BenchOptions,
} from '../shared/_shared';

const initialRows = buildRows(100);
const nextRows = removeRowById(initialRows, 50);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createRowToggle(initialRows, nextRows, 'initial');

    assertToggleMutationGuard(
      mounted.container,
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      {
        label: 'tier3 remove row',
        afterForward: () => {
          assertRowCountTransition(mounted.container, 99);
          assertTextTransition(
            mounted.container,
            'tbody tr:nth-child(50) td:nth-child(2) a',
            'Item 51'
          );
        },
        afterBackward: () => {
          assertRowCountTransition(mounted.container, 100);
          assertTextTransition(
            mounted.container,
            'tbody tr:nth-child(50) td:nth-child(2) a',
            'Item 50'
          );
        },
      }
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table remove row', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'remove one row from the middle of a 100-row table',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...tier3BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
        toggle = createRowToggle(initialRows, nextRows, 'initial');
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        toggle = null;
      },
    }
  );
});
