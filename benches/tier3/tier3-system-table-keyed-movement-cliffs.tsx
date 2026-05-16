import { bench, describe, expect } from 'vite-plus/test';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertOrderTransition,
  assertTextTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  extendBenchOptions,
  mountTableBenchmark,
  reverseRows,
  tier3BenchOptions,
  updateEveryNthRow,
} from '../shared/_shared';

const initialRows = buildRows(10_000);
const reversedRows = reverseRows(initialRows);
const updatedRows = updateEveryNthRow(initialRows);

const keyedMovementBenchOptions = extendBenchOptions(tier3BenchOptions, {
  time: 1200,
  iterations: 1,
  warmupTime: 150,
  warmupIterations: 1,
});

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createRowToggle(initialRows, reversedRows, 'initial');
    const originalSecondRow = mounted.container.querySelectorAll('tr')[1];

    assertToggleMutationGuard(
      mounted.container,
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      {
        label: 'tier3 10k keyed reorder',
        afterForward: () => {
          expect(mounted.container.querySelectorAll('tr')[9_998]).toBe(
            originalSecondRow
          );
          assertOrderTransition(
            mounted.container,
            reversedRows.map((row) => row.id)
          );
        },
        afterBackward: () => {
          expect(mounted.container.querySelectorAll('tr')[1]).toBe(
            originalSecondRow
          );
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

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createRowToggle(initialRows, updatedRows, 'initial');

    assertToggleMutationGuard(
      mounted.container,
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      {
        label: 'tier3 10k stable update',
        afterForward: () => {
          assertTextTransition(
            mounted.container,
            'tbody tr:first-child td:nth-child(2) a',
            'Item 1 !!!'
          );
          assertTextTransition(
            mounted.container,
            'tbody tr:nth-child(2) td:nth-child(2) a',
            'Item 2'
          );
          assertOrderTransition(
            mounted.container,
            initialRows.map((row) => row.id)
          );
        },
        afterBackward: () => {
          assertTextTransition(
            mounted.container,
            'tbody tr:first-child td:nth-child(2) a',
            'Item 1'
          );
          assertTextTransition(
            mounted.container,
            'tbody tr:nth-child(2) td:nth-child(2) a',
            'Item 2'
          );
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

describe('tier3 system table keyed movement cliffs', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'reverse 10,000 keyed rows',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...keyedMovementBenchOptions,
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

  bench(
    'update every 10th row in a 10,000-row table',
    () => {
      mounted!.benchmark.setRows(toggle!.next() as RowData[]);
    },
    {
      ...keyedMovementBenchOptions,
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
