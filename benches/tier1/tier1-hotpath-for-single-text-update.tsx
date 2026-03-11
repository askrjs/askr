import { bench, describe, expect } from 'vitest';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertTextTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  replaceRowLabelById,
  tier1BenchOptions,
  withForBenchDiagnostics,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const nextLabel = 'Item 500 updated once';
const updatedRows = replaceRowLabelById(initialRows, 500, nextLabel);

{
  const mounted = mountTableBenchmark(initialRows);

  try {
    const toggle = createRowToggle(initialRows, updatedRows, 'initial');
    const originalTargetRow = mounted.container.querySelectorAll('tr')[499];
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
        label: 'tier1 single text update',
        afterForward: () => {
          const nextRows = mounted.container.querySelectorAll('tr');
          expect(nextRows[499]).toBe(originalTargetRow);
          assertTextTransition(
            mounted.container,
            'tbody tr:nth-child(500) td:nth-child(2) a',
            nextLabel
          );
        },
        afterBackward: () => {
          const nextRows = mounted.container.querySelectorAll('tr');
          expect(nextRows[499]).toBe(originalTargetRow);
          assertTextTransition(
            mounted.container,
            'tbody tr:nth-child(500) td:nth-child(2) a',
            'Item 500'
          );
        },
      }
    );

    expect(['APPEND', 'NO_REORDER']).toContain(metrics.fastLaneName);
    expect(metrics.domMoves).toBe(0);
    expect(metrics.itemsCreated).toBe(0);
    expect(metrics.itemsRemoved).toBe(0);
  } finally {
    mounted.cleanup();
  }
}

describe('tier1 hotpath for single text update', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'update one keyed row label in a 1,000-row table',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...tier1BenchOptions,
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
