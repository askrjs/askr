import { bench, describe } from 'vite-plus/test';
import type { RowData } from '../shared/_shared';
import {
  assertTextTransition,
  assertToggleMutationGuard,
  buildRows,
  createRowToggle,
  createDirectionalBenchCycle,
  mountTableBenchmark,
  replaceAllRows,
  tier3BenchOptions,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const replacementRows = replaceAllRows(initialRows, 2001);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createRowToggle(initialRows, replacementRows, 'initial');

    assertToggleMutationGuard(
      mounted.container,
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      () => {
        mounted.benchmark.setRows(toggle.next() as RowData[]);
      },
      {
        label: 'tier3 replace all rows',
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
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table replace all', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let cycle: ReturnType<typeof createDirectionalBenchCycle> | null = null;

  bench(
    'replace 1,000 rows with disjoint keys',
    () => {
      cycle!.runForward();
    },
    {
      ...tier3BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
        cycle = createDirectionalBenchCycle({
          label: 'replace 1,000 disjoint keys',
          forward: () => mounted!.benchmark.setRows(replacementRows),
          reset: () => mounted!.benchmark.setRows(initialRows),
          verifyInitial: () => {
            assertTextTransition(
              mounted!.container,
              'tbody tr:first-child td:first-child',
              '1'
            );
          },
        });
      },
      teardown() {
        cycle?.teardown();
        mounted?.cleanup();
        mounted = null;
        cycle = null;
      },
    }
  );
});
