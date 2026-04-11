import { bench, describe, expect } from 'vite-plus/test';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertOrderTransition,
  assertRowCountTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  reverseRows,
  tier1BenchOptions,
  verifyTier1Invariant,
  withForBenchDiagnostics,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const reversedRows = reverseRows(initialRows);

verifyTier1Invariant('tier1 hotpath for reverse', () => {
  const mounted = mountTableBenchmark(initialRows);

  try {
    const toggle = createRowToggle(initialRows, reversedRows, 'initial');
    const originalRows = mounted.container.querySelectorAll('tr');
    const originalFirstRow = originalRows[0];
    const originalLastRow = originalRows[999];
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
        label: 'tier1 reverse',
        afterForward: () => {
          const nextRows = mounted.container.querySelectorAll('tr');
          expect(nextRows[0]).toBe(originalLastRow);
          expect(nextRows[999]).toBe(originalFirstRow);
          assertRowCountTransition(mounted.container, 1000);
          assertOrderTransition(
            mounted.container,
            reversedRows.map((row) => row.id)
          );
        },
        afterBackward: () => {
          const nextRows = mounted.container.querySelectorAll('tr');
          expect(nextRows[0]).toBe(originalFirstRow);
          expect(nextRows[999]).toBe(originalLastRow);
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

describe('tier1 hotpath for reverse', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'reverse 1,000 keyed rows',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...tier1BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
        toggle = createRowToggle(initialRows, reversedRows, 'initial');
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        toggle = null;
      },
    }
  );
});
