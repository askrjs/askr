import { resetRouteState, currentRouteRegistry } from '../../router-test-utils';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { JSXElement } from '../../../src/jsx/types';
import { state } from '../../../src';
import { Show } from '../../../src/control';
import {
  createDataRuntime,
  createQuery,
  createMutation,
  defineQuery,
  invalidate,
  invalidateOnInterval,
  queryScope,
  type Query,
} from '../../../src/data';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import { createInvalidationRecorder } from '../../../src/testing';
import { navigate } from '../../../src/router/navigate';
import { route } from '../../../src/router/route';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';

async function settle(): Promise<void> {
  await waitForNextEvaluation();
  flushScheduler();
}

const EXECUTION_MODEL_KEY = Symbol.for('__ASKR_EXECUTION_MODEL__');
const rerenderedUserQuery = defineQuery({
  key: ({ id }: { id: string }) => `users:${id}`,
  fetch: async ({ signal }: { id: string; signal: AbortSignal }) => {
    signal.throwIfAborted();
    return { name: 'Ada' };
  },
});

function resetExecutionModel(): void {
  delete (globalThis as unknown as Record<string | symbol, unknown>)[
    EXECUTION_MODEL_KEY
  ];
}

function setDocumentVisibility(value: DocumentVisibilityState): () => void {
  const ownDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'visibilityState'
  );

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => value,
  });

  return () => {
    if (ownDescriptor) {
      Object.defineProperty(document, 'visibilityState', ownDescriptor);
      return;
    }

    delete (document as Document & { visibilityState?: unknown })
      .visibilityState;
  };
}

function setDocumentHasFocus(value: boolean): () => void {
  const ownDescriptor = Object.getOwnPropertyDescriptor(document, 'hasFocus');

  Object.defineProperty(document, 'hasFocus', {
    configurable: true,
    value: () => value,
  });

  return () => {
    if (ownDescriptor) {
      Object.defineProperty(document, 'hasFocus', ownDescriptor);
      return;
    }

    delete (document as Document & { hasFocus?: unknown }).hasFocus;
  };
}

describe('data layer', () => {
  it('should evict matching prefetched query data after a successful mutation', async () => {
    const runtime = createDataRuntime();
    runtime.queryData.set('users', [{ id: '1', name: 'Ada' }]);
    runtime.queryData.set('users:1', { id: '1', name: 'Ada' });
    runtime.queryData.set('policies:1', { id: '1' });
    const mutation = createMutation({
      runtime,
      action: async () => ({ id: '1', name: 'Grace' }),
      affects: () => ['users'],
      afterSuccess: 'invalidate',
    });

    await mutation.execute(undefined);

    expect(runtime.queryData.has('users')).toBe(false);
    expect(runtime.queryData.has('users:1')).toBe(false);
    expect(runtime.queryData.get('policies:1')).toEqual({ id: '1' });
  });

  it('should build canonical scoped query keys and prefixes', () => {
    const admin = queryScope('admin');

    expect(admin.key('buckets', 'main', 'files')).toBe(
      's=admin:s=buckets:s=main:s=files:'
    );
    expect(admin.prefix('buckets', 'main')).toBe('s=admin:s=buckets:s=main:');
    expect(admin.key('buckets', 'main/folder', 'a:b', 'space value')).toBe(
      's=admin:s=buckets:s=main%2Ffolder:s=a%3Ab:s=space%20value:'
    );
    expect(admin.key('files', { q: 'x', page: 2 })).toBe(
      's=admin:s=files:o{page=n=2,q=s=x}:'
    );
  });

  it('should keep scoped query keys boundary safe', () => {
    const admin = queryScope('admin');

    expect(admin.prefix('bucket')).toBe('s=admin:s=bucket:');
    expect(admin.key('bucket-list')).toBe('s=admin:s=bucket-list:');
    expect(admin.key('bucket', 'list')).toBe('s=admin:s=bucket:s=list:');
    expect(admin.key('bucket:list')).toBe('s=admin:s=bucket%3Alist:');
  });

  it('should keep distinct primitive and structured query parts from colliding', () => {
    const admin = queryScope('admin');

    expect(admin.key('1')).not.toBe(admin.key(1));
    expect(admin.key('true')).not.toBe(admin.key(true));
    expect(admin.key('null')).not.toBe(admin.key(null));
    expect(admin.key('undefined')).not.toBe(admin.key(undefined));
    expect(admin.key({ value: 1 })).not.toBe(admin.key({ value: '1' }));
    expect(admin.key({ value: undefined })).not.toBe(admin.key({}));
    expect(admin.key(['a', 1, true, null, undefined])).not.toBe(
      admin.key(['a', '1', 'true', 'null', 'undefined'])
    );
    expect(admin.key({ q: 'x', page: 2 })).toBe(admin.key({ page: 2, q: 'x' }));
  });

  it('should reject empty or whitespace-only query scope namespaces', () => {
    const callQueryScope = queryScope as unknown as (
      namespace?: unknown
    ) => unknown;

    expect(() => callQueryScope('')).toThrow(/non-empty namespace/i);
    expect(() => callQueryScope('   ')).toThrow(/non-empty namespace/i);
  });

  it('should isolate query caches by explicit data runtime', async () => {
    const runtimeA = createDataRuntime();
    const runtimeB = createDataRuntime();
    let fetchCountA = 0;
    let fetchCountB = 0;

    const queryA = createQuery({
      runtime: runtimeA,
      key: 'shared',
      fetch: async () => {
        fetchCountA += 1;
        return { value: `a:${fetchCountA}` };
      },
    });
    const queryB = createQuery({
      runtime: runtimeB,
      key: 'shared',
      fetch: async () => {
        fetchCountB += 1;
        return { value: `b:${fetchCountB}` };
      },
    });

    await settle();
    expect(queryA.data).toEqual({ value: 'a:1' });
    expect(queryB.data).toEqual({ value: 'b:1' });

    invalidate('shared', { runtime: runtimeA });
    await settle();

    expect(fetchCountA).toBe(2);
    expect(fetchCountB).toBe(1);
    expect(queryA.data).toEqual({ value: 'a:2' });
    expect(queryB.data).toEqual({ value: 'b:1' });
  });

  it('should invalidate canonical scoped query prefixes', () => {
    const recorder = createInvalidationRecorder();
    const admin = queryScope('admin');

    try {
      admin.invalidate(['buckets', 'main']);
      admin.invalidate(['buckets', 'main', 'files'], {
        markPendingWrite: true,
      });

      expect(recorder.calls).toEqual([
        { prefix: 's=admin:s=buckets:s=main:', markPendingWrite: false },
        {
          prefix: 's=admin:s=buckets:s=main:s=files:',
          markPendingWrite: true,
        },
      ]);
    } finally {
      recorder.stop();
    }
  });

  it('should keep scoped invalidation isolated from near-miss namespaces', async () => {
    const runtime = createDataRuntime();
    const user = queryScope('user');
    const users = queryScope('users');
    const userFetch = vi.fn(async () => 'user');
    const usersFetch = vi.fn(async () => 'users');

    createQuery({
      runtime,
      key: user.key('1'),
      fetch: userFetch,
    });
    createQuery({
      runtime,
      key: users.key('1'),
      fetch: usersFetch,
    });
    await settle();

    user.invalidate([], { runtime });
    await settle();

    expect(userFetch).toHaveBeenCalledTimes(2);
    expect(usersFetch).toHaveBeenCalledTimes(1);
  });

  it('should treat raw invalidation keys as literal string prefixes', async () => {
    const runtime = createDataRuntime();
    const fetches = new Map<string, ReturnType<typeof vi.fn>>();

    for (const key of ['user:1', 'user:10', 'user:123', 'user:2']) {
      const fetch = vi.fn(async () => key);
      fetches.set(key, fetch);
      createQuery({ runtime, key, fetch });
    }
    await settle();

    invalidate('user:1', { runtime });
    await settle();

    expect(fetches.get('user:1')).toHaveBeenCalledTimes(2);
    expect(fetches.get('user:10')).toHaveBeenCalledTimes(2);
    expect(fetches.get('user:123')).toHaveBeenCalledTimes(2);
    expect(fetches.get('user:2')).toHaveBeenCalledTimes(1);
  });

  it('should invalidate on an interval owned by a component', () => {
    vi.useFakeTimers();
    const recorder = createInvalidationRecorder();

    const App = (): JSXElement => {
      invalidateOnInterval('dashboard:', { intervalMs: 50 });
      return <div>{'dashboard'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      vi.advanceTimersByTime(110);

      expect(recorder.calls).toEqual([
        { prefix: 'dashboard:', markPendingWrite: false },
        { prefix: 'dashboard:', markPendingWrite: false },
      ]);
    } finally {
      recorder.stop();
      cleanup();
      vi.useRealTimers();
    }
  });

  it('should throw a clear error for invalid interval invalidation options', () => {
    const callInvalidateOnInterval = invalidateOnInterval as unknown as (
      prefix: string,
      options?: unknown
    ) => void;
    const errorMessage =
      '[Askr] invalidateOnInterval() requires an options object with a finite numeric intervalMs.';

    expect(() => callInvalidateOnInterval('dashboard:')).toThrow(errorMessage);
    expect(() => callInvalidateOnInterval('dashboard:', {})).toThrow(
      errorMessage
    );
    expect(() =>
      callInvalidateOnInterval('dashboard:', { intervalMs: Number.NaN })
    ).toThrow(errorMessage);
  });

  it('should gate interval invalidation by active route and resume later', async () => {
    vi.useFakeTimers();
    const recorder = createInvalidationRecorder();
    const { container, cleanup } = createTestContainer();

    function Poller() {
      invalidateOnInterval('dashboard:', {
        intervalMs: 50,
        activeOn: '/poller',
      });
      return <div>{'poller'}</div>;
    }

    try {
      resetExecutionModel();
      resetRouteState();
      window.history.replaceState({}, '', '/poller');
      route('/poller', Poller);
      route('/other', Poller);

      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      vi.advanceTimersByTime(110);
      expect(recorder.prefixes).toEqual(['dashboard:', 'dashboard:']);

      navigate('/other');
      flushScheduler();
      vi.advanceTimersByTime(110);
      expect(recorder.prefixes).toEqual(['dashboard:', 'dashboard:']);

      navigate('/poller');
      flushScheduler();
      vi.advanceTimersByTime(110);
      expect(recorder.prefixes).toEqual([
        'dashboard:',
        'dashboard:',
        'dashboard:',
        'dashboard:',
      ]);
    } finally {
      recorder.stop();
      cleanupApp(container);
      cleanup();
      resetRouteState();
      window.history.replaceState({}, '', '/');
      resetExecutionModel();
      vi.useRealTimers();
    }
  });

  it('should pause interval invalidation while the document is hidden', () => {
    vi.useFakeTimers();
    let restoreVisibility = setDocumentVisibility('visible');
    const recorder = createInvalidationRecorder();

    const App = (): JSXElement => {
      invalidateOnInterval('dashboard:', {
        intervalMs: 50,
        visibleOnly: true,
      });
      return <div>{'dashboard'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      vi.advanceTimersByTime(110);
      expect(recorder.prefixes).toEqual(['dashboard:', 'dashboard:']);

      restoreVisibility();
      restoreVisibility = setDocumentVisibility('hidden');
      vi.advanceTimersByTime(110);
      expect(recorder.prefixes).toEqual(['dashboard:', 'dashboard:']);

      restoreVisibility();
      restoreVisibility = setDocumentVisibility('visible');
      vi.advanceTimersByTime(110);
      expect(recorder.prefixes).toEqual([
        'dashboard:',
        'dashboard:',
        'dashboard:',
        'dashboard:',
      ]);
    } finally {
      restoreVisibility();
      recorder.stop();
      cleanup();
      vi.useRealTimers();
    }
  });

  it('should pause interval invalidation while the document is unfocused', () => {
    vi.useFakeTimers();
    let restoreFocus = setDocumentHasFocus(true);
    const recorder = createInvalidationRecorder();

    const App = (): JSXElement => {
      invalidateOnInterval('dashboard:', {
        intervalMs: 50,
        focusedOnly: true,
      });
      return <div>{'dashboard'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      vi.advanceTimersByTime(110);
      expect(recorder.prefixes).toEqual(['dashboard:', 'dashboard:']);

      restoreFocus();
      restoreFocus = setDocumentHasFocus(false);
      vi.advanceTimersByTime(110);
      expect(recorder.prefixes).toEqual(['dashboard:', 'dashboard:']);

      restoreFocus();
      restoreFocus = setDocumentHasFocus(true);
      vi.advanceTimersByTime(110);
      expect(recorder.prefixes).toEqual([
        'dashboard:',
        'dashboard:',
        'dashboard:',
        'dashboard:',
      ]);
    } finally {
      restoreFocus();
      recorder.stop();
      cleanup();
      vi.useRealTimers();
    }
  });

  it('should clean up interval invalidation after route unmount', async () => {
    vi.useFakeTimers();
    const recorder = createInvalidationRecorder();
    const { container, cleanup } = createTestContainer();

    function Poller() {
      invalidateOnInterval('dashboard:', { intervalMs: 50 });
      return <div>{'poller'}</div>;
    }

    try {
      resetExecutionModel();
      resetRouteState();
      window.history.replaceState({}, '', '/poller');
      route('/poller', Poller);
      route('/other', () => <div>{'other'}</div>);

      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      vi.advanceTimersByTime(110);
      expect(recorder.prefixes).toEqual(['dashboard:', 'dashboard:']);

      navigate('/other');
      flushScheduler();
      vi.advanceTimersByTime(110);
      expect(recorder.prefixes).toEqual(['dashboard:', 'dashboard:']);
    } finally {
      recorder.stop();
      cleanupApp(container);
      cleanup();
      resetRouteState();
      window.history.replaceState({}, '', '/');
      resetExecutionModel();
      vi.useRealTimers();
    }
  });

  it('should not duplicate interval invalidation after rerenders', () => {
    vi.useFakeTimers();
    const recorder = createInvalidationRecorder();
    let setCount!: (value: number) => void;

    const App = (): JSXElement => {
      const count = state(0);
      setCount = count.set;
      invalidateOnInterval('dashboard:', {
        intervalMs: 50,
        markPendingWrite: true,
      });
      return <button>{String(count())}</button>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      setCount(1);
      flushScheduler();
      setCount(2);
      flushScheduler();

      vi.advanceTimersByTime(110);

      expect(recorder.calls).toEqual([
        { prefix: 'dashboard:', markPendingWrite: true },
        { prefix: 'dashboard:', markPendingWrite: true },
      ]);
    } finally {
      recorder.stop();
      cleanup();
      vi.useRealTimers();
    }
  });

  it('should share query instances by key and update all readers', async () => {
    let resolveUser!: (value: { name: string }) => void;
    const loadUser = vi.fn(
      () =>
        new Promise<{ name: string }>((resolve) => {
          resolveUser = resolve;
        })
    );

    const UserCard = ({ label }: { label: string }): JSXElement => {
      const query = createQuery({
        key: 'users:123',
        fetch: loadUser,
      });

      return (
        <div data-label={label} data-state={query.consistency}>
          {query.data?.name ?? (query.loading ? 'loading' : 'empty')}
        </div>
      );
    };

    const App = (): JSXElement => (
      <section>
        <UserCard label="a" />
        <UserCard label="b" />
      </section>
    );

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(loadUser).toHaveBeenCalledTimes(1);
      expect(container.textContent).toBe('loadingloading');

      resolveUser({ name: 'Ada' });
      await settle();

      expect(container.textContent).toBe('AdaAda');
    } finally {
      cleanup();
    }
  });

  it('should retain a shared query until its last reader unmounts', async () => {
    const runtime = createDataRuntime();
    const resolvers: Array<(value: string) => void> = [];
    const loadUser = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        })
    );
    let setFirstVisible!: (value: boolean) => void;
    let setSecondVisible!: (value: boolean) => void;

    const UserCard = ({ label }: { label: string }): JSXElement => {
      const query = createQuery({
        runtime,
        key: 'users:shared-owner',
        fetch: loadUser,
      });

      return <span data-label={label}>{query.data ?? 'loading'}</span>;
    };

    const App = (): JSXElement => {
      const firstVisible = state(true);
      const secondVisible = state(true);
      setFirstVisible = firstVisible.set;
      setSecondVisible = secondVisible.set;

      return (
        <section>
          <Show when={firstVisible()}>
            <UserCard label="first" />
          </Show>
          <Show when={secondVisible()}>
            <UserCard label="second" />
          </Show>
        </section>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(loadUser).toHaveBeenCalledTimes(1);
      resolvers[0]?.('Ada');
      await settle();
      expect(container.textContent).toBe('AdaAda');

      setFirstVisible(false);
      flushScheduler();

      expect(container.textContent).toBe('Ada');
      expect(loadUser).toHaveBeenCalledTimes(1);
      expect(runtime.queryCache.has('users:shared-owner')).toBe(true);

      setSecondVisible(false);
      flushScheduler();

      expect(container.textContent).toBe('');
      expect(runtime.queryCache.has('users:shared-owner')).toBe(false);

      setFirstVisible(true);
      flushScheduler();
      await settle();

      expect(loadUser).toHaveBeenCalledTimes(2);
      expect(container.textContent).toBe('loading');

      resolvers[1]?.('Grace');
      await settle();
      expect(container.textContent).toBe('Grace');
    } finally {
      cleanup();
    }
  });

  it('should keep the first fetch function for a shared query key', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let resolveFirst!: (value: string) => void;
    const firstFetch = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        })
    );
    const secondFetch = vi.fn(() => Promise.resolve('second'));

    const Primary = () => {
      const query = createQuery({
        key: 'users:shared',
        fetch: firstFetch,
      });

      return <span data-slot="primary">{query.data ?? 'loading'}</span>;
    };

    const Secondary = () => {
      const query = createQuery({
        key: 'users:shared',
        fetch: secondFetch,
      });

      return <span data-slot="secondary">{query.data ?? 'loading'}</span>;
    };

    const App = (): JSXElement => (
      <section>
        <Primary />
        <Secondary />
      </section>
    );

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(firstFetch).toHaveBeenCalledTimes(1);
      expect(secondFetch).toHaveBeenCalledTimes(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[askr] Conflicting shared query definition for key "users:shared"'
        )
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`fetch`'));

      resolveFirst('from-first');
      await settle();

      expect(container.textContent).toBe('from-firstfrom-first');
    } finally {
      warnSpy.mockRestore();
      cleanup();
    }
  });

  it('should not warn given the same defined query when its reader rerenders', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let rerender: (() => void) | undefined;

    const App = (): JSXElement => {
      const renderCount = state(0);
      rerender = () => renderCount.set(renderCount() + 1);
      const query = createQuery(rerenderedUserQuery, { id: 'defined' });

      return (
        <div data-render={renderCount()}>{query.data?.name ?? 'loading'}</div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('Ada');

      rerender?.();
      flushScheduler();
      await settle();

      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(
          '[askr] Conflicting shared query definition for key "users:defined"'
        )
      );
    } finally {
      warnSpy.mockRestore();
      cleanup();
    }
  });

  it('should warn given different defined queries when they share a key', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const firstQuery = defineQuery({
      key: () => 'users:defined-conflict',
      fetch: async () => 'first',
    });
    const secondQuery = defineQuery({
      key: () => 'users:defined-conflict',
      fetch: async () => 'second',
    });

    const App = (): JSXElement => {
      const first = createQuery(firstQuery, undefined);
      const second = createQuery(secondQuery, undefined);

      return <div>{first.data ?? second.data ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[askr] Conflicting shared query definition for key "users:defined-conflict"'
        )
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`fetch`'));
    } finally {
      warnSpy.mockRestore();
      cleanup();
    }
  });

  it('should warn when the same reader rerenders a query key with a conflicting definition', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let setUseFirst: ((value: boolean) => void) | undefined;
    const firstFetch = vi.fn(async () => 'first');
    const secondFetch = vi.fn(async () => 'second');

    const App = (): JSXElement => {
      const useFirst = state(true);
      setUseFirst = useFirst.set;

      const query = createQuery({
        key: 'users:rerendered-definition',
        fetch: useFirst() ? firstFetch : secondFetch,
      });

      return <div>{query.data ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('first');
      expect(firstFetch).toHaveBeenCalledTimes(1);
      expect(secondFetch).toHaveBeenCalledTimes(0);

      setUseFirst?.(false);
      flushScheduler();
      await settle();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[askr] Conflicting shared query definition for key "users:rerendered-definition"'
        )
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`fetch`'));
      expect(container.textContent).toBe('first');
    } finally {
      warnSpy.mockRestore();
      cleanup();
    }
  });

  it('should evict query cache entries after the last owner unmounts', async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;

    const firstFetch = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        })
    );
    const secondFetch = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveSecond = resolve;
        })
    );

    const makeApp = ({
      label,
      fetch,
    }: {
      label: string;
      fetch: () => Promise<string>;
    }): (() => JSXElement) => {
      return () => {
        const query = createQuery({
          key: 'users:evict',
          fetch,
        });

        return (
          <div data-label={label} data-state={query.consistency}>
            {query.data ?? (query.loading ? 'loading' : 'empty')}
          </div>
        );
      };
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: makeApp({ label: 'first', fetch: firstFetch }),
      });
      flushScheduler();
      await settle();

      expect(firstFetch).toHaveBeenCalledTimes(1);

      resolveFirst('alpha');
      await settle();
      expect(container.textContent).toContain('alpha');

      cleanup();

      createIsland({
        root: container,
        component: makeApp({ label: 'second', fetch: secondFetch }),
      });
      flushScheduler();
      await settle();

      expect(secondFetch).toHaveBeenCalledTimes(1);

      resolveSecond('beta');
      await settle();

      expect(container.textContent).toContain('beta');
    } finally {
      cleanup();
    }
  });

  it('should keep the last value visible while prefix invalidation refreshes', async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    let callCount = 0;

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'users:list',
        fetch: async () => {
          callCount += 1;
          return callCount === 1
            ? new Promise<string>((resolve) => {
                resolveFirst = resolve;
              })
            : new Promise<string>((resolve) => {
                resolveSecond = resolve;
              });
        },
      });

      return (
        <div>
          {query.data ?? 'empty'}|{query.consistency}|
          {query.refreshing ? 'r' : 's'}
        </div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('empty|fresh|s');

      resolveFirst('first');
      await settle();
      expect(container.textContent).toBe('first|fresh|s');

      invalidate('users:');
      flushScheduler();
      await settle();
      expect(container.textContent).toBe('first|refreshing|r');

      resolveSecond('second');
      await settle();
      expect(container.textContent).toBe('second|fresh|s');
    } finally {
      cleanup();
    }
  });

  it('should expose a stale error state when the first fetch fails', async () => {
    let rejectUser!: (error: Error) => void;
    let queryRef!: Query<{ id: string }>;
    const loadError = new Error('load failed');

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:error:first-load',
        fetch: () =>
          new Promise<{ id: string }>((_resolve, reject) => {
            rejectUser = reject as (error: Error) => void;
          }),
      });

      queryRef = query;
      return (
        <div>
          {query.consistency}|{query.loading ? 'l' : 's'}|
          {query.refreshing ? 'r' : 'n'}|{query.error ? 'err' : 'ok'}|
          {query.data?.id ?? 'none'}
        </div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('fresh|l|n|ok|none');

      rejectUser(loadError);
      await settle();

      expect(container.textContent).toBe('stale|s|n|err|none');
      expect(queryRef.consistency).toBe('stale');
      expect(queryRef.loading).toBe(false);
      expect(queryRef.refreshing).toBe(false);
      expect(queryRef.stale).toBe(true);
      expect(queryRef.staleReason).toBe('error');
      expect(queryRef.data).toBeNull();
      expect(queryRef.error).toBe(loadError);
    } finally {
      cleanup();
    }
  });

  it('should normalize nullish query failures into a non-null error state', async () => {
    let rejectUser!: (error: null) => void;
    let queryRef!: Query<{ id: string }>;

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:error:nullish',
        fetch: () =>
          new Promise<{ id: string }>((_resolve, reject) => {
            rejectUser = reject as (error: null) => void;
          }),
      });

      queryRef = query;
      return <div>{query.error ? 'err' : 'ok'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('ok');

      rejectUser(null);
      await settle();

      expect(container.textContent).toBe('err');
      expect(queryRef.consistency).toBe('stale');
      expect(queryRef.staleReason).toBe('error');
      expect(queryRef.error).toBeInstanceOf(Error);
      expect((queryRef.error as Error).message).toBe('Unknown query error');
    } finally {
      cleanup();
    }
  });

  it('should keep inconsistent data available in stale state without an error', async () => {
    let resolveUser!: (value: { id: string; version: number }) => void;
    let queryRef!: Query<{ id: string; version: number }>;

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:stale:inconsistent',
        fetch: () =>
          new Promise<{ id: string; version: number }>((resolve) => {
            resolveUser = resolve;
          }),
        isConsistent: () => false,
        reconcile: () => false,
      });

      queryRef = query;
      return (
        <div>
          {query.consistency}|{query.loading ? 'l' : 's'}|
          {query.refreshing ? 'r' : 'n'}|{query.error ? 'err' : 'ok'}|
          {query.data?.id ?? 'none'}|{query.data?.version ?? 'none'}
        </div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('fresh|l|n|ok|none|none');

      resolveUser({ id: '123', version: 1 });
      await settle();

      expect(container.textContent).toBe('stale|s|n|ok|123|1');
      expect(queryRef.consistency).toBe('stale');
      expect(queryRef.loading).toBe(false);
      expect(queryRef.refreshing).toBe(false);
      expect(queryRef.stale).toBe(true);
      expect(queryRef.staleReason).toBe('inconsistent');
      expect(queryRef.data).toEqual({ id: '123', version: 1 });
      expect(queryRef.error).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('should await an async reconciliation decision before retrying', async () => {
    vi.useFakeTimers();
    let resolveReconcile!: (shouldRetry: boolean) => void;
    let queryCalls = 0;
    const fetchUser = async () => {
      queryCalls += 1;
      return { id: '123', version: queryCalls };
    };
    const isConsistent = (data: { version: number }) => data.version > 1;
    const reconcile = () =>
      new Promise<boolean>((resolve) => {
        resolveReconcile = resolve;
      });

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:reconcile:await',
        fetch: fetchUser,
        isConsistent,
        reconcile,
      });
      return <div>{query.data?.version ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('1');
      expect(queryCalls).toBe(1);

      resolveReconcile(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(queryCalls).toBe(1);

      await vi.advanceTimersByTimeAsync(25);
      flushScheduler();
      await settle();

      expect(queryCalls).toBe(2);
      expect(container.textContent).toBe('2');
    } finally {
      vi.useRealTimers();
      cleanup();
    }
  });

  it('should not expose pending-write while a query is still on its first load', async () => {
    let resolveUser!: (value: { id: string }) => void;
    let queryCalls = 0;

    const saveUser = createMutation({
      action: async () => ({ ok: true }),
      affects: () => ['user:123'],
      afterSuccess: 'invalidate',
    });

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:123',
        fetch: () => {
          queryCalls += 1;
          return new Promise<{ id: string }>((resolve) => {
            resolveUser = resolve;
          });
        },
      });

      return (
        <button onClick={() => void saveUser.execute(undefined)}>
          {query.consistency}|{query.loading ? 'l' : 's'}|
          {query.refreshing ? 'r' : 'n'}|{query.data?.id ?? 'none'}
        </button>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(queryCalls).toBe(1);
      expect(container.textContent).toBe('fresh|l|n|none');

      (container.firstElementChild as HTMLButtonElement).click();
      flushScheduler();
      await settle();

      // An invalidation during the initial load aborts stale work and starts
      // the newest generation; it must not expose pending-write state.
      expect(queryCalls).toBe(2);
      expect(container.textContent).toBe('fresh|l|n|none');

      resolveUser({ id: '123' });
      await settle();

      expect(container.textContent).toBe('fresh|s|n|123');
    } finally {
      cleanup();
    }
  });

  it('should surface an awaited reconciliation failure as a terminal stale error', async () => {
    let rejectReconcile!: (error: Error) => void;
    let queryRef!: Query<{ id: string }>;
    const reconcileError = new Error('reconciliation failed');

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:reconcile:error',
        fetch: async () => ({ id: '123' }),
        isConsistent: () => false,
        reconcile: () =>
          new Promise<boolean>((_resolve, reject) => {
            rejectReconcile = reject as (error: Error) => void;
          }),
      });
      queryRef = query;

      return <div>{query.error ? 'error' : query.consistency}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('stale');
      expect(queryRef.error).toBeNull();

      rejectReconcile(reconcileError);
      await settle();

      expect(container.textContent).toBe('error');
      expect(queryRef.error).toBe(reconcileError);
      expect(queryRef.staleReason).toBe('error');
    } finally {
      cleanup();
    }
  });

  it('should preserve cached data when a refresh fails', async () => {
    let resolveInitial!: (value: { id: string; version: number }) => void;
    let rejectRefresh!: (error: Error) => void;
    let queryCalls = 0;
    let queryRef!: Query<{ id: string; version: number }>;
    const refreshError = new Error('refresh failed');

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:error:refresh',
        fetch: () => {
          queryCalls += 1;
          return queryCalls === 1
            ? new Promise<{ id: string; version: number }>((resolve) => {
                resolveInitial = resolve;
              })
            : new Promise<{ id: string; version: number }>(
                (_resolve, reject) => {
                  rejectRefresh = reject as (error: Error) => void;
                }
              );
        },
      });

      queryRef = query;
      return (
        <div>
          {query.consistency}|{query.loading ? 'l' : 's'}|
          {query.refreshing ? 'r' : 'n'}|{query.error ? 'err' : 'ok'}|
          {query.data?.version ?? 'none'}
        </div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('fresh|l|n|ok|none');

      resolveInitial({ id: '123', version: 1 });
      await settle();
      expect(container.textContent).toBe('fresh|s|n|ok|1');

      invalidate('user:error:refresh');
      flushScheduler();
      await settle();
      expect(container.textContent).toBe('refreshing|s|r|ok|1');

      rejectRefresh(refreshError);
      await settle();

      expect(container.textContent).toBe('stale|s|n|err|1');
      expect(queryRef.consistency).toBe('stale');
      expect(queryRef.loading).toBe(false);
      expect(queryRef.refreshing).toBe(false);
      expect(queryRef.stale).toBe(true);
      expect(queryRef.staleReason).toBe('error');
      expect(queryRef.data).toEqual({ id: '123', version: 1 });
      expect(queryRef.error).toBe(refreshError);
    } finally {
      cleanup();
    }
  });

  it('should settle refresh when its consistency predicate throws', async () => {
    let queryRef!: Query<{ id: string; version: number }>;
    let queryCalls = 0;
    const consistencyError = new Error('consistency failed');

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:consistency:error',
        fetch: async () => {
          queryCalls += 1;
          return { id: '123', version: queryCalls };
        },
        isConsistent: (data) => {
          if (data.version > 1) {
            throw consistencyError;
          }
          return true;
        },
      });
      queryRef = query;

      return (
        <div>{query.error ? 'error' : (query.data?.version ?? 'loading')}</div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();
      expect(container.textContent).toBe('1');

      const refresh = queryRef.refresh();
      flushScheduler();
      await expect(refresh).resolves.toBeUndefined();
      await settle();

      expect(container.textContent).toBe('error');
      expect(queryRef.error).toBe(consistencyError);
      expect(queryRef.staleReason).toBe('error');
      expect(queryRef.data).toEqual({ id: '123', version: 1 });
    } finally {
      cleanup();
    }
  });

  it('should coalesce equivalent manual refreshes into the newest request', async () => {
    let resolveRefresh!: (value: { id: string; version: number }) => void;
    let queryRef!: Query<{ id: string; version: number }>;
    let queryCalls = 0;

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:manual:coalesce',
        fetch: () => {
          queryCalls += 1;
          if (queryCalls === 1) {
            return Promise.resolve({ id: '123', version: 1 });
          }
          return new Promise<{ id: string; version: number }>((resolve) => {
            resolveRefresh = resolve;
          });
        },
      });
      queryRef = query;
      return <div>{query.data?.version ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();
      expect(container.textContent).toBe('1');

      const first = queryRef.refresh();
      const second = queryRef.refresh();
      expect(second).toBe(first);
      flushScheduler();
      expect(queryCalls).toBe(2);

      resolveRefresh({ id: '123', version: 2 });
      await expect(first).resolves.toBeUndefined();
      await expect(second).resolves.toBeUndefined();
      await settle();
      expect(container.textContent).toBe('2');
    } finally {
      cleanup();
    }
  });

  it('should expose an aborted stale reason when a cached refresh rejects with AbortError', async () => {
    let resolveInitial!: (value: { id: string; version: number }) => void;
    let rejectRefresh!: (error: DOMException) => void;
    let queryCalls = 0;
    let queryRef!: Query<{ id: string; version: number }>;
    const abortError = new DOMException('aborted', 'AbortError');

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:stale:aborted-refresh',
        fetch: () => {
          queryCalls += 1;
          if (queryCalls === 1) {
            return new Promise<{ id: string; version: number }>((resolve) => {
              resolveInitial = resolve;
            });
          }

          return new Promise<{ id: string; version: number }>(
            (_resolve, reject) => {
              rejectRefresh = reject as (error: DOMException) => void;
            }
          );
        },
      });

      queryRef = query;
      return (
        <div>
          {query.consistency}|{query.loading ? 'l' : 's'}|
          {query.refreshing ? 'r' : 'n'}|{query.error ? 'err' : 'ok'}|
          {query.data?.version ?? 'none'}
        </div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('fresh|l|n|ok|none');

      resolveInitial({ id: '123', version: 1 });
      await settle();

      expect(container.textContent).toBe('fresh|s|n|ok|1');
      expect(queryRef.staleReason).toBeNull();

      invalidate('user:stale:aborted-refresh');
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('refreshing|s|r|ok|1');
      expect(queryRef.consistency).toBe('refreshing');
      expect(queryRef.staleReason).toBeNull();

      rejectRefresh(abortError);
      await settle();

      expect(container.textContent).toBe('stale|s|n|ok|1');
      expect(queryRef.consistency).toBe('stale');
      expect(queryRef.loading).toBe(false);
      expect(queryRef.refreshing).toBe(false);
      expect(queryRef.stale).toBe(true);
      expect(queryRef.staleReason).toBe('aborted');
      expect(queryRef.data).toEqual({ id: '123', version: 1 });
      expect(queryRef.error).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('should mark affected queries pending-write after a successful mutation', async () => {
    let resolveInitial!: (value: { id: string; version: number }) => void;
    let resolveRefresh!: (value: { id: string; version: number }) => void;
    let userVersion = 1;
    let queryCalls = 0;

    const saveUser = createMutation({
      action: async (name: string) => {
        userVersion += 1;
        return { id: '123', name, version: userVersion };
      },
      affects: () => ['user:123'],
      afterSuccess: 'invalidate',
    });

    const App = (): JSXElement => {
      const query = createQuery({
        key: 'user:123',
        fetch: async () => {
          queryCalls += 1;
          return queryCalls === 1
            ? new Promise<{ id: string; version: number }>((resolve) => {
                resolveInitial = resolve;
              })
            : new Promise<{ id: string; version: number }>((resolve) => {
                resolveRefresh = resolve;
              });
        },
        isConsistent: (data) => data.version >= userVersion,
      });

      return (
        <button onClick={() => void saveUser.execute('Grace')}>
          {saveUser.pending
            ? 'Saving'
            : query.consistency === 'pending-write'
              ? 'Saved, syncing...'
              : query.data
                ? `Saved v${query.data.version}`
                : 'Loading'}
        </button>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('Loading');

      resolveInitial({ id: '123', version: 1 });
      await settle();
      expect(container.textContent).toBe('Saved v1');

      (container.firstElementChild as HTMLButtonElement).click();
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('Saved, syncing...');
      expect(saveUser.status).toBe('success');
      expect(saveUser.result).toEqual({ id: '123', name: 'Grace', version: 2 });

      resolveRefresh({ id: '123', version: 2 });
      await settle();

      expect(container.textContent).toBe('Saved v2');
    } finally {
      cleanup();
    }
  });

  it('should expose predictable mutation status, result, and error transitions', async () => {
    let resolveAction!: (value: { saved: true }) => void;
    let rejectAction!: (error: Error) => void;
    let shouldFail = false;

    const saveError = new Error('save failed');
    const mutation = createMutation({
      action: (_input: string) =>
        new Promise<{ saved: true }>((resolve, reject) => {
          if (shouldFail) {
            rejectAction = reject as (error: Error) => void;
            return;
          }

          resolveAction = resolve;
        }),
    });

    expect(mutation.status).toBe('idle');
    expect(mutation.pending).toBe(false);
    expect(mutation.error).toBeNull();
    expect(mutation.result).toBeNull();

    const successPromise = mutation.execute('Ada');
    expect(mutation.status).toBe('pending');
    expect(mutation.pending).toBe(true);
    expect(mutation.error).toBeNull();
    expect(mutation.result).toBeNull();

    resolveAction({ saved: true });
    await expect(successPromise).resolves.toEqual({ saved: true });

    expect(mutation.status).toBe('success');
    expect(mutation.pending).toBe(false);
    expect(mutation.error).toBeNull();
    expect(mutation.result).toEqual({ saved: true });

    mutation.reset();
    expect(mutation.status).toBe('idle');
    expect(mutation.pending).toBe(false);
    expect(mutation.error).toBeNull();
    expect(mutation.result).toBeNull();

    shouldFail = true;
    const failurePromise = mutation.execute('Grace');
    expect(mutation.status).toBe('pending');
    expect(mutation.pending).toBe(true);

    rejectAction(saveError);
    await expect(failurePromise).rejects.toBe(saveError);

    expect(mutation.status).toBe('error');
    expect(mutation.pending).toBe(false);
    expect(mutation.error).toBe(saveError);
    expect(mutation.result).toBeNull();
  });

  it('should retain mutation invalidation callbacks from execute start across a rerender', async () => {
    let resolveAction!: (value: string) => void;
    let setUseReplacement!: (value: boolean) => void;
    const affects = vi.fn<(input: string, result: string) => string[]>();

    const App = (): JSXElement => {
      const useReplacement = state(false);
      setUseReplacement = useReplacement.set;
      const mutation = createMutation({
        action: () =>
          new Promise<string>((resolve) => {
            resolveAction = resolve;
          }),
        affects: useReplacement()
          ? () => {
              affects('replacement', 'replacement');
              return [];
            }
          : (input, result) => {
              affects(input, result);
              return [];
            },
        afterSuccess: 'invalidate',
      });

      return (
        <button onClick={() => void mutation.execute('initial')}>save</button>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      (container.firstElementChild as HTMLButtonElement).click();
      setUseReplacement(true);
      flushScheduler();

      resolveAction('saved');
      await settle();

      expect(affects).toHaveBeenCalledTimes(1);
      expect(affects).toHaveBeenCalledWith('initial', 'saved');
    } finally {
      cleanup();
    }
  });

  it('should normalize nullish mutation failures into a non-null error state', async () => {
    const mutation = createMutation({
      action: async () => {
        throw null;
      },
    });

    await expect(mutation.execute(undefined)).rejects.toBeNull();

    expect(mutation.status).toBe('error');
    expect(mutation.pending).toBe(false);
    expect(mutation.error).toBeInstanceOf(Error);
    expect((mutation.error as Error).message).toBe('Unknown mutation error');
    expect(mutation.result).toBeNull();
  });

  it('should only abort in-flight mutations', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    const pendingMutation = createMutation({
      action: (_input: string, { signal }) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(abortError);
            },
            { once: true }
          );
        }),
    });

    const execution = pendingMutation.execute('Ada');
    expect(pendingMutation.status).toBe('pending');
    expect(pendingMutation.pending).toBe(true);

    pendingMutation.abort();
    await expect(execution).rejects.toBe(abortError);

    expect(pendingMutation.status).toBe('idle');
    expect(pendingMutation.pending).toBe(false);
    expect(pendingMutation.error).toBeNull();
    expect(pendingMutation.result).toBeNull();

    const settledMutation = createMutation({
      action: async (_input: string) => 'saved',
    });

    await expect(settledMutation.execute('Grace')).resolves.toBe('saved');
    expect(settledMutation.status).toBe('success');
    expect(settledMutation.result).toBe('saved');

    settledMutation.abort();
    expect(settledMutation.status).toBe('success');
    expect(settledMutation.pending).toBe(false);
    expect(settledMutation.error).toBeNull();
    expect(settledMutation.result).toBe('saved');
  });
});
