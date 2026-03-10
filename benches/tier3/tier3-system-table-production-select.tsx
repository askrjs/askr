import { bench, describe, expect } from 'vitest';
import { flushScheduler } from '../../tests/helpers/test-renderer';
import {
  buildRows,
  mountTableBenchmark,
  tier3BenchOptions,
} from '../shared/_shared';

const initialRows = buildRows(3);

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    (mounted.container.querySelectorAll('a')[1] as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    flushScheduler();
    expect(mounted.container.querySelectorAll('tr')[1].className).toBe(
      'danger'
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table production select', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let rowLink: HTMLElement | null = null;

  bench(
    'select a row through the DOM click path',
    () => {
      rowLink!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
      flushScheduler();
    },
    {
      ...tier3BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
        rowLink = mounted.container.querySelectorAll('a')[1] as HTMLElement;
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        rowLink = null;
      },
    }
  );
});
