import { bench, describe, expect } from 'vite-plus/test';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertOrderTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  extendBenchOptions,
  mountTableBenchmark,
  tier3BenchOptions,
} from '../shared/_shared';

const initialRows = buildRows(2_000);

function reverseMovePrefix(rows: RowData[], moveCount: number): RowData[] {
  return [
    ...rows.slice(0, moveCount + 1).reverse(),
    ...rows.slice(moveCount + 1),
  ];
}

function getLisLength(sequence: number[]): number {
  const tails: number[] = [];
  for (const value of sequence) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (tails[middle]! < value) low = middle + 1;
      else high = middle;
    }
    tails[low] = value;
  }
  return tails.length;
}

const densities = [200, 500, 1_000, 1_500, 1_999].map((moveCount) => ({
  moveCount,
  rows: reverseMovePrefix(initialRows, moveCount),
}));

for (const { moveCount, rows } of densities) {
  expect(getLisLength(rows.map((row) => row.id - 1))).toBe(2_000 - moveCount);
}

const options = extendBenchOptions(tier3BenchOptions, {
  time: 1200,
  iterations: 1,
  warmupTime: 150,
  warmupIterations: 1,
});

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const target = densities[2]!.rows;
    const toggle = createRowToggle(initialRows, target, 'initial');
    assertToggleMutationGuard(
      mounted.container,
      () => mounted.benchmark.setRows(toggle.next() as RowData[]),
      () => mounted.benchmark.setRows(toggle.next() as RowData[]),
      {
        label: 'tier3 keyed movement density',
        afterForward: () => {
          expect(mounted.container.querySelectorAll('tr')).toHaveLength(2_000);
          assertOrderTransition(
            mounted.container,
            target.map((row) => row.id)
          );
        },
        afterBackward: () => {
          expect(mounted.container.querySelectorAll('tr')).toHaveLength(2_000);
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

describe('tier3 system table keyed movement density', () => {
  for (const { moveCount, rows } of densities) {
    let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
    let toggle: BenchToggle<readonly RowData[]> | null = null;

    bench(
      `move exactly ${moveCount.toLocaleString('en-US')} of 2,000 keyed rows`,
      () => {
        mounted!.benchmark.setRows(toggle!.next() as RowData[]);
      },
      {
        ...options,
        setup() {
          mounted = mountTableBenchmark(initialRows);
          toggle = createRowToggle(initialRows, rows, 'initial');
        },
        teardown() {
          mounted?.cleanup();
          mounted = null;
          toggle = null;
        },
      }
    );
  }
});
