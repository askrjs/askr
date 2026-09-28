import { bench, describe, expect } from 'vite-plus/test';
import type { BenchToggle, RowData } from '../shared/_shared';
import {
  assertOrderTransition,
  buildRows,
  createRowToggle,
  mountTableBenchmark,
  tier1BenchOptions,
  verifyTier1Invariant,
} from '../shared/_shared';
import { trackDOMMutations } from '../../test-utils/render/test-renderer';

const initialRows = buildRows(1000);
const prefixReverseCases = [10, 50, 100, 250, 500, 900, 999].map((moves) => {
  const prefixLength = moves + 1;
  const rows = [
    ...initialRows.slice(0, prefixLength).reverse(),
    ...initialRows.slice(prefixLength),
  ];
  return {
    moves,
    rows,
    shape: 'prefix reverse',
    label: `reverse a ${prefixLength}-row prefix in a 1,000-row list (minimum ${moves} moves)`,
  };
});
const distributedSwapCases = [10, 50, 100, 250, 500].map((moves) => {
  const rows = initialRows.slice();
  for (let index = 0; index < moves; index += 1) {
    const start = Math.floor(
      (index * (initialRows.length - 2)) / Math.max(1, moves - 1)
    );
    [rows[start], rows[start + 1]] = [rows[start + 1], rows[start]];
  }
  return {
    moves,
    rows,
    shape: 'distributed swaps',
    label: `scatter ${moves} adjacent swaps across a 1,000-row list (minimum ${moves} moves)`,
  };
});
const movementCases = [...prefixReverseCases, ...distributedSwapCases];

for (const movementCase of movementCases) {
  verifyTier1Invariant(
    `tier1 keyed movement density ${movementCase.shape} ${movementCase.moves}`,
    () => {
      const mounted = mountTableBenchmark(initialRows);
      try {
        const originalNodes = new Map(
          Array.from(mounted.container.querySelectorAll('tr'), (row, index) => [
            initialRows[index].id,
            row,
          ])
        );
        const verifyOrderAndIdentity = (rows: readonly RowData[]) => {
          assertOrderTransition(
            mounted.container,
            rows.map((row) => row.id)
          );
          const actual = Array.from(mounted.container.querySelectorAll('tr'));
          expect(
            rows.every(
              (row, index) => actual[index] === originalNodes.get(row.id)
            )
          ).toBe(true);
        };

        const forward = trackDOMMutations(mounted.container, () => {
          mounted.benchmark.setRows(movementCase.rows);
        });
        expect(forward.addedNodes).toBe(movementCase.moves);
        expect(forward.removedNodes).toBe(movementCase.moves);
        verifyOrderAndIdentity(movementCase.rows);

        const backward = trackDOMMutations(mounted.container, () => {
          mounted.benchmark.setRows(initialRows);
        });
        expect(backward.addedNodes).toBe(movementCase.moves);
        expect(backward.removedNodes).toBe(movementCase.moves);
        verifyOrderAndIdentity(initialRows);
      } finally {
        mounted.cleanup();
      }
    }
  );
}

describe('tier1 keyed movement density', () => {
  for (const movementCase of movementCases) {
    let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
    let toggle: BenchToggle<readonly RowData[]> | null = null;

    bench(
      movementCase.label,
      () => mounted!.benchmark.setRows(toggle!.next() as RowData[]),
      {
        ...tier1BenchOptions,
        iterations: 100,
        setup() {
          mounted = mountTableBenchmark(initialRows);
          toggle = createRowToggle(initialRows, movementCase.rows);
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
