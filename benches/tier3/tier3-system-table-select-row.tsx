import { bench, describe } from 'vite-plus/test';
import type { BenchToggle } from '../shared/_shared';
import {
  assertSelectionTransition,
  assertToggleMutationGuard,
  buildRows,
  createSelectionToggle,
  mountTableBenchmark,
  tier3BenchOptions,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const selectionBatchSize = 100;

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const toggle = createSelectionToggle(500, 501, 'first');
    mounted.benchmark.setSelected(toggle.current());
    assertSelectionTransition(mounted.container, 499);

    assertToggleMutationGuard(
      mounted.container,
      () => {
        mounted.benchmark.setSelected(toggle.next());
      },
      () => {
        mounted.benchmark.setSelected(toggle.next());
      },
      {
        label: 'tier3 select row',
        afterForward: () => assertSelectionTransition(mounted.container, 500),
        afterBackward: () => assertSelectionTransition(mounted.container, 499),
      }
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table select row', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let toggle: BenchToggle<number> | null = null;

  bench(
    'select 100 alternating rows in a 1,000-row table',
    () => {
      for (let index = 0; index < selectionBatchSize; index++) {
        mounted!.benchmark.setSelected(toggle!.next());
      }
    },
    {
      ...tier3BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
        toggle = createSelectionToggle(500, 501, 'first');
        mounted.benchmark.setSelected(toggle.current());
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        toggle = null;
      },
    }
  );
});
