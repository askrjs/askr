import { bench, describe, expect } from 'vitest';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertOrderTransition,
  assertRowCountTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  shuffleRows,
  tier1BenchOptions,
  verifyTier1Invariant,
  withForBenchDiagnostics,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const shuffledRows = shuffleRows(initialRows, 0x5eed_1234);

expect(shuffledRows.map((row) => row.id)).not.toEqual(
  initialRows.map((row) => row.id)
);

verifyTier1Invariant('tier1 hotpath for random shuffle', () => {
  const mounted = mountTableBenchmark(initialRows);

  try {
    const toggle = createRowToggle(initialRows, shuffledRows, 'initial');
    const originalRows = mounted.container.querySelectorAll('tr');
    const expectedFirstRow = originalRows[shuffledRows[0].id - 1];
    const expectedLastRow = originalRows[shuffledRows[999].id - 1];
    let metrics!: ReturnType<typeof withForBenchDiagnostics>['metrics'];

    assertToggleMutationGuard(
      mounted.container,
      () => {
        ({ metrics } = withForBenchDiagnostics(() => {
          mounted.benchmark.setRows(toggle.next() as RowData[]);
        }));
      },
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      {
        label: 'tier1 random shuffle',
        afterForward: () => {
          const nextRows = mounted.container.querySelectorAll('tr');
          expect(nextRows[0]).toBe(expectedFirstRow);
          expect(nextRows[999]).toBe(expectedLastRow);
          assertRowCountTransition(mounted.container, 1000);
          assertOrderTransition(
            mounted.container,
            shuffledRows.map((row) => row.id)
          );
        },
        afterBackward: () => {
          assertRowCountTransition(mounted.container, 1000);
          assertOrderTransition(
            mounted.container,
            initialRows.map((row) => row.id)
          );
        },
      }
    );

    expect(metrics.fastLaneName).toBe('FULL_KEYED');
    expect(metrics.itemsCreated).toBe(0);
    expect(metrics.itemsRemoved).toBe(0);
  } finally {
    mounted.cleanup();
  }
});

describe('tier1 hotpath for random shuffle', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'shuffle 1,000 keyed rows with a fixed permutation',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...tier1BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
        toggle = createRowToggle(initialRows, shuffledRows, 'initial');
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        toggle = null;
      },
    }
  );
});
