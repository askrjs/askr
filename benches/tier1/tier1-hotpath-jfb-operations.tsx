import { describe, expect, test } from 'vite-plus/test';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertRowCountTransition,
  assertSelectionTransition,
  assertToggleMutationGuard,
  buildRows,
  createDirectionalBenchCycle,
  createRowToggle,
  createSelectionToggle,
  extendBenchOptions,
  mountTableBenchmark,
  removeRowById,
  tier1BenchOptions,
  verifyTier1Invariant,
  runBench,
} from '../shared/_shared';

// js-framework-benchmark style operations on the 1,000- and 10,000-row table,
// run in jsdom. Update every 10th row and swap rows are covered by
// tier1-hotpath-for-stable-update and tier1-hotpath-for-keyed-reorder.
const emptyRows: RowData[] = [];
const rows1k = buildRows(1000);
const rows10k = buildRows(10_000);
const removedId = 500;
const rowsWithoutOne = removeRowById(rows1k, removedId);
const bulkBenchOptions = extendBenchOptions(tier1BenchOptions, {
  time: 1_200,
  iterations: 10,
  warmupTime: 300,
  warmupIterations: 2,
});

function rowIds(container: ParentNode): string[] {
  return Array.from(
    container.querySelectorAll('tbody tr td:first-child'),
    (cell) => cell.textContent ?? ''
  );
}

verifyTier1Invariant('tier1 hotpath jfb create rows', () => {
  for (const rows of [rows1k, rows10k]) {
    const mounted = mountTableBenchmark();
    try {
      const toggle = createRowToggle(emptyRows, rows, 'initial');
      assertToggleMutationGuard(
        mounted.container,
        () => mounted.benchmark.setRows(toggle.next() as RowData[]),
        () => mounted.benchmark.setRows(toggle.next() as RowData[]),
        {
          label: `tier1 create ${rows.length} rows`,
          afterForward: () => {
            assertRowCountTransition(mounted.container, rows.length);
            expect(rowIds(mounted.container)[rows.length - 1]).toBe(
              String(rows.length)
            );
          },
          afterBackward: () => assertRowCountTransition(mounted.container, 0),
        }
      );
    } finally {
      mounted.cleanup();
    }
  }
});

verifyTier1Invariant('tier1 hotpath jfb select row', () => {
  const mounted = mountTableBenchmark(rows1k);
  try {
    const toggle = createSelectionToggle(3, 700, 'first');
    mounted.benchmark.setSelected(toggle.current());
    assertToggleMutationGuard(
      mounted.container,
      () => mounted.benchmark.setSelected(toggle.next()),
      () => mounted.benchmark.setSelected(toggle.next()),
      {
        label: 'tier1 select row',
        afterForward: () => assertSelectionTransition(mounted.container, 699),
        afterBackward: () => assertSelectionTransition(mounted.container, 2),
      }
    );
  } finally {
    mounted.cleanup();
  }
});

verifyTier1Invariant('tier1 hotpath jfb remove one row', () => {
  const mounted = mountTableBenchmark(rows1k);
  try {
    const original = Array.from(mounted.container.querySelectorAll('tr'));
    const toggle = createRowToggle(rows1k, rowsWithoutOne, 'initial');
    assertToggleMutationGuard(
      mounted.container,
      () => mounted.benchmark.setRows(toggle.next() as RowData[]),
      () => mounted.benchmark.setRows(toggle.next() as RowData[]),
      {
        label: 'tier1 remove one row',
        afterForward: () => {
          assertRowCountTransition(mounted.container, 999);
          expect(rowIds(mounted.container)).not.toContain(String(removedId));
          const kept = Array.from(mounted.container.querySelectorAll('tr'));
          expect(kept[0]).toBe(original[0]);
          expect(kept[998]).toBe(original[999]);
        },
        afterBackward: () => assertRowCountTransition(mounted.container, 1000),
      }
    );
  } finally {
    mounted.cleanup();
  }
});

verifyTier1Invariant('tier1 hotpath jfb clear rows', () => {
  const mounted = mountTableBenchmark(rows1k);
  try {
    const toggle = createRowToggle(rows1k, emptyRows, 'initial');
    assertToggleMutationGuard(
      mounted.container,
      () => mounted.benchmark.setRows(toggle.next() as RowData[]),
      () => mounted.benchmark.setRows(toggle.next() as RowData[]),
      {
        label: 'tier1 clear rows',
        afterForward: () => assertRowCountTransition(mounted.container, 0),
        afterBackward: () => assertRowCountTransition(mounted.container, 1000),
      }
    );
  } finally {
    mounted.cleanup();
  }
});

describe('tier1 js-framework-benchmark style operations (jsdom)', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let cycle: ReturnType<typeof createDirectionalBenchCycle> | null = null;
  let selection: BenchToggle<number> | null = null;

  function directional(
    label: string,
    start: readonly RowData[],
    forward: readonly RowData[]
  ) {
    mounted = mountTableBenchmark(start as RowData[]);
    cycle = createDirectionalBenchCycle({
      label,
      forward: () => mounted!.benchmark.setRows(forward as RowData[]),
      reset: () => mounted!.benchmark.setRows(start as RowData[]),
      verifyInitial: () =>
        assertRowCountTransition(mounted!.container, start.length),
    });
  }

  function release() {
    cycle?.teardown();
    mounted?.cleanup();
    mounted = null;
    cycle = null;
    selection = null;
  }

  test('create 1,000 rows from an empty table', async ({ bench }) => {
    await runBench(
      bench,
      'create 1,000 rows from an empty table',
      () => cycle!.runForward(),
      {
        ...tier1BenchOptions,
        setup: () => directional('tier1 create 1,000', emptyRows, rows1k),
        teardown: release,
      }
    );
  });

  test('create 10,000 rows from an empty table', async ({ bench }) => {
    await runBench(
      bench,
      'create 10,000 rows from an empty table',
      () => cycle!.runForward(),
      {
        ...bulkBenchOptions,
        setup: () => directional('tier1 create 10,000', emptyRows, rows10k),
        teardown: release,
      }
    );
  });

  test('select a row in a 1,000-row table', async ({ bench }) => {
    await runBench(
      bench,
      'select a row in a 1,000-row table',
      () => mounted!.benchmark.setSelected(selection!.next()),
      {
        ...tier1BenchOptions,
        setup() {
          mounted = mountTableBenchmark(rows1k);
          selection = createSelectionToggle(3, 700, 'first');
          mounted.benchmark.setSelected(selection.current());
        },
        teardown: release,
      }
    );
  });

  test('remove one row from a 1,000-row table', async ({ bench }) => {
    await runBench(
      bench,
      'remove one row from a 1,000-row table',
      () => cycle!.runForward(),
      {
        ...tier1BenchOptions,
        setup: () => directional('tier1 remove one', rows1k, rowsWithoutOne),
        teardown: release,
      }
    );
  });

  test('clear a 1,000-row table', async ({ bench }) => {
    await runBench(
      bench,
      'clear a 1,000-row table',
      () => cycle!.runForward(),
      {
        ...tier1BenchOptions,
        setup: () => directional('tier1 clear', rows1k, emptyRows),
        teardown: release,
      }
    );
  });
});
