import { bench, describe, expect } from 'vite-plus/test';
import type { BenchToggle, RowData } from '../../shared/_shared';
import {
  assertRowCountTransition,
  assertTextTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  replaceAllRows,
  tier1BenchOptions,
  verifyTier1Invariant,
  withForBenchDiagnostics,
} from '../../shared/_shared';

const rows = buildRows(1000);
const emptyRows: RowData[] = [];
const replacementRows = replaceAllRows(rows, 2001);

verifyTier1Invariant('tier1 hotpath for append', () => {
  const mounted = mountTableBenchmark();
  try {
    const toggle = createRowToggle(emptyRows, rows, 'initial');
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
        label: 'tier1 append rows',
        afterForward: () => assertRowCountTransition(mounted.container, 1000),
        afterBackward: () => assertRowCountTransition(mounted.container, 0),
      }
    );

    expect(metrics.fastLaneName).toBe('APPEND');
    expect(metrics.domNodesCreated).toBe(10_000);
    expect(metrics.listenerBindings).toBe(2_000);
    expect(metrics.reactivePropsMounted).toBe(1_000);
    expect(metrics.replaceChildrenCommits).toBe(0);
    expect(metrics.bulkClearCommits).toBe(0);
  } finally {
    mounted.cleanup();
  }
});

verifyTier1Invariant('tier1 hotpath for replace all', () => {
  const mounted = mountTableBenchmark(rows);
  try {
    const toggle = createRowToggle(rows, replacementRows, 'initial');
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
        label: 'tier1 replace all rows',
        afterForward: () => {
          assertTextTransition(
            mounted.container,
            'tbody tr:first-child td:first-child',
            '2001'
          );
          assertTextTransition(
            mounted.container,
            'tbody tr:first-child td:nth-child(2) a',
            'Item 2001'
          );
        },
        afterBackward: () => {
          assertTextTransition(
            mounted.container,
            'tbody tr:first-child td:first-child',
            '1'
          );
          assertTextTransition(
            mounted.container,
            'tbody tr:first-child td:nth-child(2) a',
            'Item 1'
          );
        },
      }
    );

    expect(metrics.fastLaneName).toBe('FULL_KEYED');
    expect(metrics.domNodesCreated).toBe(10_000);
    expect(metrics.listenerBindings).toBe(2_000);
    expect(metrics.reactivePropsMounted).toBe(1_000);
    expect(metrics.replaceChildrenCommits).toBe(1);
    expect(metrics.bulkClearCommits).toBe(0);
  } finally {
    mounted.cleanup();
  }
});

describe('tier1 hotpath for append', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'append 1,000 keyed rows from empty',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...tier1BenchOptions,
      setup() {
        mounted = mountTableBenchmark();
        toggle = createRowToggle(emptyRows, rows, 'initial');
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        toggle = null;
      },
    }
  );
});
