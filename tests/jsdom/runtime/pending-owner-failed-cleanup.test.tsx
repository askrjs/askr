import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanupApp } from '../../../src/boot';
import { getSignal } from '../../../src';
import { createDataRuntime, createQuery, type Query } from '../../../src/data';
import { task } from '../../../src/resources';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve();
    flushScheduler();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pending owner work after failed cleanup', () => {
  it.each(['resolve', 'reject'] as const)(
    'should retire query and mount work before a late fetch %s even when another cleanup throws',
    async (outcome) => {
      const reported: unknown[] = [];
      vi.stubGlobal('reportError', (error: unknown) => reported.push(error));
      const cleanupFailure = new Error('sibling cleanup failed');
      const runtime = createDataRuntime();
      const view = createTestContainer();
      let query!: Query<{ name: string }>;
      let ownerSignal!: AbortSignal;
      let fetchSignal!: AbortSignal;
      let resolveFetch!: (value: { name: string }) => void;
      let rejectFetch!: (error: Error) => void;
      let resolveMount!: (cleanup: () => void) => void;
      let mountCleanup = 0;
      let renders = 0;
      const fetch = vi.fn(({ signal }: { signal: AbortSignal }) => {
        fetchSignal = signal;
        return new Promise<{ name: string }>((resolve, reject) => {
          resolveFetch = resolve;
          rejectFetch = reject;
        });
      });
      const App = () => {
        renders++;
        ownerSignal = getSignal();
        query = createQuery({
          key: 'pending-failed-cleanup',
          runtime,
          fetch,
          initialData: { name: 'seed' },
          gcTime: 0,
        });
        task(
          () =>
            new Promise<() => void>((resolve) => {
              resolveMount = resolve;
            })
        );
        task(() => () => {
          throw cleanupFailure;
        });
        return <p>{query.data?.name}</p>;
      };
      try {
        createIsland({ root: view.container, component: App });
        await settle();
        const refresh = query.refresh();
        flushScheduler();
        expect(fetchSignal.aborted).toBe(false);
        cleanupApp(view.container);
        await refresh;
        await settle();
        const rendered = renders;
        const markup = view.container.innerHTML;
        expect(ownerSignal.aborted).toBe(true);
        expect(fetchSignal.aborted).toBe(true);
        expect(runtime.queryCache.size).toBe(0);
        if (outcome === 'resolve') resolveFetch({ name: 'obsolete' });
        else rejectFetch(new Error('obsolete transport failure'));
        resolveMount(() => {
          mountCleanup++;
        });
        await settle();
        expect(renders).toBe(rendered);
        expect(view.container.innerHTML).toBe(markup);
        expect(fetch).toHaveBeenCalledOnce();
        expect(mountCleanup).toBe(1);
        expect(reported).toEqual([cleanupFailure]);
        cleanupApp(view.container);
        await settle();
        expect(mountCleanup).toBe(1);
        expect(reported).toEqual([cleanupFailure]);
      } finally {
        view.cleanup();
      }
    }
  );
});
