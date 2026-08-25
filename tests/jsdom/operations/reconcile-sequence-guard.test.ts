import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { QueryCell } from '../../../src/data/query-cell';
import { flushScheduler } from '../../../test-utils/render/test-renderer';

afterEach(() => {
  vi.useRealTimers();
});

describe('reconcile sequence guard (regression for #357)', () => {
  it('should not let a stale reconcile retry timer restart an in-flight superseded fetch while the cell is still stale (not fresh)', async () => {
    vi.useFakeTimers();
    const pending: Array<(value: { version: number }) => void> = [];
    const fetch = vi.fn(
      () =>
        new Promise<{ version: number }>((resolve) => {
          pending.push(resolve);
        })
    );
    const cache = new Map<string, QueryCell<unknown>>();
    const cell = new QueryCell(
      {
        key: 'sequence-guard',
        fetch,
        isConsistent: (value) => value.version > 2,
        reconcile: () => true,
      },
      'sequence-guard',
      cache
    );
    const owner = {};
    cell.attach(owner, 0);
    try {
      // Fetch #1: inconsistent -> schedules reconcile retry timer A
      // (captured sequence 1).
      void cell.refresh();
      flushScheduler();
      pending[0]!({ version: 1 });
      await settle();
      expect(fetch).toHaveBeenCalledTimes(1);

      // Superseded before timer A fires: fetch #2 starts (sequence 2) but
      // has NOT resolved yet -> the cell's consistency is still 'refreshing'
      // (not 'fresh'), so a naive "only skip when fresh" guard would not
      // protect this window.
      cell.invalidate();
      flushScheduler();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(cell.consistency).not.toBe('fresh');

      // Now let stale timer A fire while fetch #2 is still in flight.
      // The correct behavior is to no-op: timer A belongs to a superseded
      // reconcile sequence, and fetch #2 must be left completely alone.
      await vi.advanceTimersByTimeAsync(25);
      flushScheduler();
      await settle();

      // No extra fetch was started, and fetch #2's own controller/promise
      // was not aborted or clobbered by timer A.
      expect(fetch).toHaveBeenCalledTimes(2);

      // fetch #2 can still resolve normally and reach a fresh state.
      pending[1]!({ version: 3 });
      await settle();
      expect(cell.data).toEqual({ version: 3 });
      expect(cell.consistency).toBe('fresh');
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      cell.detach(owner, 0);
    }
  });
});

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
  await Promise.resolve();
}
