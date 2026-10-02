import { describe, expect, test } from 'vite-plus/test';
import type { RowData } from '../shared/_shared';
import {
  assertRowCountTransition,
  assertTextTransition,
  assertToggleMutationGuard,
  buildRows,
  createDirectionalBenchCycle,
  extendBenchOptions,
  createRowToggle,
  mountTableBenchmark,
  replaceAllRows,
  tier1BenchOptions,
  verifyTier1Invariant,
  runBench,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const insertedRows = [...initialRows, ...buildRows(1, 1001)];
const replacementRows = replaceAllRows(initialRows, 2001);
const replacementBenchOptions = extendBenchOptions(tier1BenchOptions, {
  time: 1_200,
  iterations: 12,
  warmupTime: 300,
  warmupIterations: 2,
});

verifyTier1Invariant('tier1 hotpath for sparse keyed insertion', () => {
  const mounted = mountTableBenchmark(initialRows);
  try {
    const originalRows = Array.from(mounted.container.querySelectorAll('tr'));
    const toggle = createRowToggle(initialRows, insertedRows, 'initial');

    assertToggleMutationGuard(
      mounted.container,
      () => mounted.benchmark.setRows(toggle.next() as RowData[]),
      () => mounted.benchmark.setRows(toggle.next() as RowData[]),
      {
        label: 'tier1 sparse keyed insertion',
        afterForward: () => {
          assertRowCountTransition(mounted.container, 1001);
          const rows = Array.from(mounted.container.querySelectorAll('tr'));
          expect(originalRows.every((row, index) => rows[index] === row)).toBe(
            true
          );
          assertTextTransition(
            mounted.container,
            'tbody tr:last-child td:first-child',
            '1001'
          );
        },
        afterBackward: () => {
          assertRowCountTransition(mounted.container, 1000);
          const rows = Array.from(mounted.container.querySelectorAll('tr'));
          expect(originalRows.every((row, index) => rows[index] === row)).toBe(
            true
          );
        },
      }
    );
  } finally {
    mounted.cleanup();
  }
});

verifyTier1Invariant('tier1 hotpath for full keyed replacement', () => {
  const mounted = mountTableBenchmark(initialRows);
  try {
    const originalRows = new Set(
      Array.from(mounted.container.querySelectorAll('tr'))
    );
    const toggle = createRowToggle(initialRows, replacementRows, 'initial');

    assertToggleMutationGuard(
      mounted.container,
      () => mounted.benchmark.setRows(toggle.next() as RowData[]),
      () => mounted.benchmark.setRows(toggle.next() as RowData[]),
      {
        label: 'tier1 full keyed replacement',
        afterForward: () => {
          assertRowCountTransition(mounted.container, 1000);
          const rows = Array.from(mounted.container.querySelectorAll('tr'));
          expect(rows.every((row) => !originalRows.has(row))).toBe(true);
          const ids = Array.from(
            mounted.container.querySelectorAll('tbody tr td:first-child'),
            (cell) => cell.textContent
          );
          expect(ids).toEqual(replacementRows.map((row) => String(row.id)));
        },
        afterBackward: () => {
          assertRowCountTransition(mounted.container, 1000);
          assertTextTransition(
            mounted.container,
            'tbody tr:first-child td:first-child',
            '1'
          );
        },
      }
    );
  } finally {
    mounted.cleanup();
  }
});

describe('tier1 keyed insert and replacement', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let insertionCycle: ReturnType<typeof createDirectionalBenchCycle> | null =
    null;
  let replacementCycle: ReturnType<typeof createDirectionalBenchCycle> | null =
    null;

  test('insert or remove one keyed row in a 1,000-row list', async ({
    bench,
  }) => {
    await runBench(
      bench,
      'insert or remove one keyed row in a 1,000-row list',
      () => insertionCycle!.runForward(),
      {
        ...tier1BenchOptions,
        setup() {
          mounted = mountTableBenchmark(initialRows);
          const originalRows = Array.from(
            mounted.container.querySelectorAll('tr')
          );
          const toggle = createRowToggle(initialRows, insertedRows, 'initial');
          insertionCycle = createDirectionalBenchCycle({
            label: 'tier1 sparse keyed insertion',
            forward: () =>
              mounted!.benchmark.setRows(toggle.next() as RowData[]),
            reset: () => mounted!.benchmark.setRows(toggle.next() as RowData[]),
            verifyInitial: () => {
              assertRowCountTransition(mounted!.container, 1000);
              const rows = Array.from(
                mounted!.container.querySelectorAll('tr')
              );
              expect(
                originalRows.every((row, index) => rows[index] === row)
              ).toBe(true);
            },
          });
        },
        teardown() {
          insertionCycle?.teardown();
          mounted?.cleanup();
          mounted = null;
          insertionCycle = null;
        },
      }
    );
  });

  test('replace all keys in a 1,000-row list', async ({ bench }) => {
    await runBench(
      bench,
      'replace all keys in a 1,000-row list',
      () => replacementCycle!.runForward(),
      {
        ...replacementBenchOptions,
        setup() {
          mounted = mountTableBenchmark(initialRows);
          const toggle = createRowToggle(
            initialRows,
            replacementRows,
            'initial'
          );
          replacementCycle = createDirectionalBenchCycle({
            label: 'tier1 full keyed replacement',
            forward: () =>
              mounted!.benchmark.setRows(toggle.next() as RowData[]),
            reset: () => mounted!.benchmark.setRows(toggle.next() as RowData[]),
            verifyInitial: () => {
              assertRowCountTransition(mounted!.container, 1000);
              const ids = Array.from(
                mounted!.container.querySelectorAll('tbody tr td:first-child'),
                (cell) => cell.textContent
              );
              expect(ids).toEqual(initialRows.map((row) => String(row.id)));
            },
          });
        },
        teardown() {
          replacementCycle?.teardown();
          mounted?.cleanup();
          mounted = null;
          replacementCycle = null;
        },
      }
    );
  });
});
