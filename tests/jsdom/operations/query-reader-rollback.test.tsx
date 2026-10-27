import { describe, expect, it, vi } from 'vite-plus/test';
import { state } from '../../../src';
import { createDataRuntime, createQuery, type Query } from '../../../src/data';
import type { State } from '../../../src';
import type { JSXElement } from '../../../src/jsx/types';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('createQuery render rollback', () => {
  it('should keep the committed query reader when a key change render fails', async () => {
    const runtime = createDataRuntime();
    const fetch = vi.fn(async (id: string) => ({ id }));
    let id!: State<string>;
    let fail!: State<boolean>;
    let committedQuery!: Query<{ id: string }>;
    const App = (): JSXElement => {
      id = state('a');
      fail = state(false);
      const currentId = id();
      const query = createQuery({
        runtime,
        key: `query-reader-rollback:${currentId}`,
        initialData: { id: currentId },
        fetch: () => fetch(currentId),
      });
      if (!fail()) committedQuery = query;
      if (fail()) throw new Error('render failed');
      return <p>{query.data?.id}</p>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.textContent).toBe('a');
      expect(runtime.queryCache.has('query-reader-rollback:a')).toBe(true);

      expect(() => {
        id.set('b');
        fail.set(true);
        flushScheduler();
      }).toThrow('render failed');

      expect(container.textContent).toBe('a');
      expect(runtime.queryCache.has('query-reader-rollback:a')).toBe(true);
      expect(runtime.queryCache.has('query-reader-rollback:b')).toBe(false);
      expect(committedQuery.data).toEqual({ id: 'a' });

      id.set('a');
      fail.set(false);
      flushScheduler();
      const refresh = committedQuery.refresh();
      flushScheduler();
      await refresh;
      expect(fetch).toHaveBeenCalledOnce();
      expect(committedQuery.data).toEqual({ id: 'a' });
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });
});
