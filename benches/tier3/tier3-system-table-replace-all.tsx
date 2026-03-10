import { bench, describe, expect } from 'vitest';
import {
  buildRows,
  mountTableBenchmark,
  replaceAllRows,
  tier3BenchOptions,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const replacementRows = replaceAllRows(initialRows, 2001);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    mounted.benchmark.setRows(replacementRows);
    const cells = mounted.container
      .querySelectorAll('tr')[0]
      .querySelectorAll('td');
    expect(cells[0].textContent).toBe('2001');
    expect(cells[1].textContent).toBe('Item 2001');
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table replace all', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;

  bench(
    'replace an entire 1,000-row table with new keyed data',
    () => {
      mounted!.benchmark.setRows(replacementRows);
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
