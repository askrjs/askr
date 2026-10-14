import { describe, expect, it, vi } from 'vite-plus/test';
import { createDataRuntime, createQuery, type Query } from '../../../src/data';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('query reader and cache lifetime transitions', () => {
  it.each([0, 50])(
    'should reattach from an abort listener without reviving obsolete work (gcTime: %s)',
    async (gcTime) => {
      vi.useFakeTimers();
      const runtime = createDataRuntime();
      const first = createTestContainer();
      const second = createTestContainer();
      const requests: Array<{
        signal: AbortSignal;
        resolve: (data: { name: string }) => void;
      }> = [];
      let firstQuery!: Query<{ name: string }>;
      let secondQuery!: Query<{ name: string }>;
      const options = {
        key: 'reattach-from-abort',
        runtime,
        gcTime,
        initialData: { name: 'Seed' },
        fetch: ({ signal }: { signal: AbortSignal }) =>
          new Promise<{ name: string }>((resolve) => {
            requests.push({ signal, resolve });
            if (requests.length === 1) {
              signal.addEventListener('abort', () => {
                createIsland({
                  root: second.container,
                  component: () => {
                    secondQuery = createQuery(options);
                    return <div>{secondQuery.data?.name}</div>;
                  },
                });
                flushScheduler();
              });
            }
          }),
      };

      try {
        createIsland({
          root: first.container,
          component: () => {
            firstQuery = createQuery(options);
            return <div>{firstQuery.data?.name}</div>;
          },
        });
        flushScheduler();
        const pending = firstQuery.refresh();
        flushScheduler();
        first.cleanup();
        await pending;

        expect(requests[0].signal.aborted).toBe(true);
        if (gcTime === 0) expect(secondQuery).not.toBe(firstQuery);
        else expect(secondQuery).toBe(firstQuery);
        expect(secondQuery.staleReason).toBe(gcTime === 0 ? null : 'aborted');
        expect(second.container.textContent).toBe('Seed');
        vi.advanceTimersByTime(50);
        expect(runtime.queryCache.get(options.key)).toBe(secondQuery);

        requests[0].resolve({ name: 'Obsolete' });
        await Promise.resolve();
        await Promise.resolve();
        flushScheduler();
        expect(second.container.textContent).toBe('Seed');
        const refresh = secondQuery.refresh();
        flushScheduler();
        expect(requests[1].signal.aborted).toBe(false);
        requests[1].resolve({ name: 'Current' });
        await refresh;
        flushScheduler();
        expect(second.container.textContent).toBe('Current');

        second.cleanup();
        vi.advanceTimersByTime(50);
        expect(runtime.queryCache.has(options.key)).toBe(false);
      } finally {
        first.cleanup();
        second.cleanup();
        vi.useRealTimers();
      }
    }
  );
});
