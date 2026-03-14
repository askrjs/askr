import { bench, describe, expect } from 'vitest';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertTextTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  tier1BenchOptions,
  verifyTier1Invariant,
  updateEveryNthRow,
  withForBenchDiagnostics,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const updatedRows = updateEveryNthRow(initialRows);

verifyTier1Invariant('tier1 hotpath for stable keyed update', () => {
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createRowToggle(initialRows, updatedRows, 'initial');
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
        label: 'tier1 stable update',
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

    expect(['APPEND', 'NO_REORDER']).toContain(metrics.fastLaneName);
  } finally {
    mounted.cleanup();
  }
});

describe('tier1 hotpath for stable keyed update', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'update every 10th row without reordering keys',
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
