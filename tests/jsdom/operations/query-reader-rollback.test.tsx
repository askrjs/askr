import { describe, expect, it, vi } from 'vite-plus/test';
import { state, type State } from '../../../src';
import {
  createDataRuntime,
  createQuery,
  disposeDataRuntime,
  type Query,
} from '../../../src/data';
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

  it('should retain the committed fetch definition after a failed same-key render', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runtime = createDataRuntime();
    const fetch = vi.fn(async (version: string) => ({ version }));
    let version!: State<string>;
    let fail!: State<boolean>;
    let committedQuery!: Query<{ version: string }>;
    const App = (): JSXElement => {
      version = state('committed');
      fail = state(false);
      const currentVersion = version();
      const query = createQuery({
        runtime,
        key: 'query-definition-rollback',
        initialData: { version: 'cached' },
        fetch: () => fetch(currentVersion),
      });
      if (!fail()) committedQuery = query;
      if (fail()) throw new Error('render failed');
      return <p>reader</p>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.textContent).toBe('reader');

      expect(() => {
        version.set('discarded');
        fail.set(true);
        flushScheduler();
      }).toThrow('render failed');

      const refresh = committedQuery.refresh();
      flushScheduler();
      await refresh;
      expect(fetch).toHaveBeenCalledWith('committed');
      expect(committedQuery.data).toEqual({ version: 'committed' });
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('should not evict an ownerless cached target on a failed key change', () => {
    const runtime = createDataRuntime();
    const targetQuery = createQuery({
      runtime,
      key: 'query-ownerless-target',
      initialData: { id: 'target' },
      fetch: async () => ({ id: 'target' }),
    });
    let key!: State<string>;
    let fail!: State<boolean>;
    const App = (): JSXElement => {
      key = state('query-ownerless-source');
      fail = state(false);
      createQuery({
        runtime,
        key: key(),
        initialData: { id: 'source' },
        fetch: async () => ({ id: 'source' }),
      });
      if (fail()) throw new Error('render failed');
      return <p>reader</p>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      // The runtime's ownerless handle cache has a bounded retention window.
      expect(targetQuery.data).toEqual({ id: 'target' });
      expect(runtime.queryCache.has('query-ownerless-target')).toBe(true);
      createIsland({ root: container, component: App });
      flushScheduler();

      expect(() => {
        key.set('query-ownerless-target');
        fail.set(true);
        flushScheduler();
      }).toThrow('render failed');

      expect(runtime.queryCache.has('query-ownerless-target')).toBe(true);
    } finally {
      cleanup();
      disposeDataRuntime(runtime);
      vi.restoreAllMocks();
    }
  });
});
