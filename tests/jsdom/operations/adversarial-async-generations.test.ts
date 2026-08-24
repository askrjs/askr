import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createMutation, getDefaultDataRuntime } from '../../../src/data';
import { QueryCell } from '../../../src/data/query-cell';
import { flushScheduler } from '../../../test-utils/render/test-renderer';

afterEach(() => {
  vi.useRealTimers();
  getDefaultDataRuntime().queryData.clear();
});

describe('adversarial async generations', () => {
  it('should invalidate successful superseded mutations that ignore cancellation', async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    getDefaultDataRuntime().queryData.set('todos:one', { stale: true });
    const mutation = createMutation({
      action: (input: string) =>
        new Promise<string>((resolve) => {
          if (input === 'first') resolveFirst = resolve;
          else resolveSecond = resolve;
        }),
      affects: () => ['todos:'],
      afterSuccess: 'invalidate',
    });

    const first = mutation.execute('first');
    const second = mutation.execute('second');
    resolveFirst('first-result');
    await expect(first).resolves.toBe('first-result');

    expect(getDefaultDataRuntime().queryData.has('todos:one')).toBe(false);
    expect(mutation.status).toBe('pending');

    resolveSecond('second-result');
    await expect(second).resolves.toBe('second-result');
    expect(mutation.result).toBe('second-result');
  });

  it('should coalesce rapid invalidations before the runtime task starts', async () => {
    const fetch = vi.fn(async () => ({ id: 'latest' }));
    const cache = new Map<string, QueryCell<unknown>>();
    const cell = new QueryCell({ key: 'rapid', fetch }, 'rapid', cache);
    const owner = {};
    cell.attach(owner, 0);
    try {
      cell.refresh();
      cell.invalidate();
      cell.invalidate();
      flushScheduler();
      await settle();

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(cell.data).toEqual({ id: 'latest' });
    } finally {
      cell.detach(owner, 0);
    }
  });

  it('should not let a stale reconcile timer restart a newer refresh', async () => {
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
        key: 'reconcile-generation',
        fetch,
        isConsistent: (value) => value.version > 1,
        reconcile: () => true,
      },
      'reconcile-generation',
      cache
    );
    const owner = {};
    cell.attach(owner, 0);
    try {
      void cell.refresh();
      flushScheduler();
      pending[0]!({ version: 1 });
      await settle();

      cell.invalidate();
      flushScheduler();
      expect(fetch).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(25);
      flushScheduler();
      expect(fetch).toHaveBeenCalledTimes(2);

      pending[1]!({ version: 2 });
      await settle();
      expect(cell.data).toEqual({ version: 2 });
      expect(cell.consistency).toBe('fresh');
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
