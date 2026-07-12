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

function rotatePrefix(rows: RowData[], fraction: number): RowData[] {
  const count = Math.floor(rows.length * fraction);
  if (count < 2) return rows;
  return [...rows.slice(1, count), rows[0], ...rows.slice(count)];
}

const densities = [10, 25, 50, 75, 100].map((percent) => ({
  percent,
  rows: rotatePrefix(initialRows, percent / 100),
}));

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
  for (const { percent, rows } of densities) {
    let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
    let toggle: BenchToggle<readonly RowData[]> | null = null;

    bench(
      `move ${percent}% of 2,000 keyed rows`,
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
