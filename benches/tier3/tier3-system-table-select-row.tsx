import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  tier3BenchOptions,
} from '../shared/_shared';

const initialRows = buildRows(1000);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    mounted.benchmark.setSelected(500);
    expect(mounted.container.querySelectorAll('tr')[499].className).toBe(
      'danger'
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table select row', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'select one row in a 1,000-row table',
    () => {
      mounted!.benchmark.setSelected(500);
    },
    {
      ...tier3BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
      },
    }
  );
});
