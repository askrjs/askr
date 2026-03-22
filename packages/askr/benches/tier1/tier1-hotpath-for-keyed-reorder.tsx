import { bench, describe, expect } from 'vitest';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertOrderTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  swapRows,
  tier1BenchOptions,
  verifyTier1Invariant,
  withForBenchDiagnostics,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const swappedRows = swapRows(initialRows, 1, 998);

verifyTier1Invariant('tier1 hotpath for keyed reorder', () => {
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createRowToggle(initialRows, swappedRows, 'initial');
    const originalSecondRow = mounted.container.querySelectorAll('tr')[1];
    const originalLastTargetRow = mounted.container.querySelectorAll('tr')[998];
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
        label: 'tier1 keyed reorder',
        afterForward: () => {
          const nextRows = mounted.container.querySelectorAll('tr');
          expect(nextRows[1]).toBe(originalLastTargetRow);
          expect(nextRows[998]).toBe(originalSecondRow);
          assertOrderTransition(
            mounted.container,
            swappedRows.map((row) => row.id)
          );
        },
        afterBackward: () => {
          const nextRows = mounted.container.querySelectorAll('tr');
          expect(nextRows[1]).toBe(originalSecondRow);
          expect(nextRows[998]).toBe(originalLastTargetRow);
          assertOrderTransition(
            mounted.container,
            initialRows.map((row) => row.id)
          );
        },
      }
    );

    expect(metrics.fastLaneName).toBe('SWAP');
  } finally {
    mounted.cleanup();
  }
});

describe('tier1 hotpath for keyed reorder', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'swap distant keyed rows while preserving DOM identity',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...tier1BenchOptions,
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
