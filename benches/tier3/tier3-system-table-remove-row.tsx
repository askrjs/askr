import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  removeRowById,
  tier3BenchOptions,
} from '../shared/_shared';

const initialRows = buildRows(100);
const nextRows = removeRowById(initialRows, 50);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    mounted.benchmark.setRows(nextRows);
    expect(mounted.container.querySelectorAll('tr')).toHaveLength(99);
    expect(
      mounted.container.querySelectorAll('tr')[49].querySelectorAll('td')[1]
        .textContent
    ).toBe('Item 51');
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table remove row', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'remove one row from the middle of a 100-row table',
    () => {
      mounted!.benchmark.setRows(nextRows);
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
