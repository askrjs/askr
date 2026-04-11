import { bench, describe, expect } from 'vite-plus/test';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertOrderTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  swapRows,
  tier3BenchOptions,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const swappedRows = swapRows(initialRows, 1, 998);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createRowToggle(initialRows, swappedRows, 'initial');
    const originalRow = mounted.container.querySelectorAll('tr')[1];

    assertToggleMutationGuard(
      mounted.container,
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      {
        label: 'tier3 swap rows',
        afterForward: () => {
          expect(mounted.container.querySelectorAll('tr')[998]).toBe(
            originalRow
          );
          assertOrderTransition(
            mounted.container,
            swappedRows.map((row) => row.id)
          );
        },
        afterBackward: () => {
          expect(mounted.container.querySelectorAll('tr')[1]).toBe(originalRow);
          assertOrderTransition(
            mounted.container,
            initialRows.map((row) => row.id)
          );
        },
      }
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table swap rows', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'swap two distant rows in a 1,000-row table',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...tier3BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
        toggle = createRowToggle(initialRows, swappedRows, 'initial');
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        toggle = null;
      },
    }
  );
});
