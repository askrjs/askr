import { describe, it, expect } from 'vite-plus/test';
import { For, Show } from '../../../src/control';
import { resource, task } from '../../../src/resources';
import { state, type State } from '../../../src/index';
import type { JSXElement } from '../../../src/jsx/types';
import { schedule } from '../../../src/core/reactive/scheduler';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../../../test-utils/render/test-renderer';

async function settleResourceWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
}

describe('resource() late resolution after unmount (B5)', () => {
  it('should not start a queued client resource after cleanup before the post lane flush', () => {
    const { container, cleanup } = createTestContainer();
    let starts = 0;
    let show!: State<boolean>;

    const Child = (): JSXElement => {
      resource(() => {
        starts += 1;
        return 'ready';
      }, []);

      return <div>{'mounted'}</div>;
    };

    try {
      createIsland({
        root: container,
        component: () => {
          show = state(false);
          return show() ? <Child /> : null;
        },
      });
      flushScheduler();

      show.set(true);
      // Unmount after Child's render queued its start, before the post lane.
      schedule(
        {
          run: () => {
            expect(starts).toBe(0);
            show.set(false);
          },
        },
        'effect'
      );

      expect(() => flushScheduler()).not.toThrow();
      expect(starts).toBe(0);
      expect(getSchedulerState().queueLength).toBe(0);
    } finally {
      cleanup();
    }
  });

  // A promise that resolves AFTER the component unmounts must be inert: no
  // throw, and no late snapshot/DOM mutation.
  it('should not throw or mutate when a fetch resolves after unmount', async () => {
    let resolveFetch!: (v: string) => void;
    let snapshot: { value: string | null } | null = null;

    const App = (): JSXElement => {
      const result = resource<string>(
        () =>
          new Promise<string>((resolve) => {
            resolveFetch = resolve;
          }),
        []
      );
      snapshot = result;
      return <div>{result.value ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    createIsland({ root: container, component: App });
    flushScheduler();
    await settleResourceWork();
    expect(container.textContent).toBe('loading');
    expect(snapshot!.value).toBe(null);

    // Unmount the component (aborts the in-flight fetch, nulls notifyUpdate).
    cleanup();

    // The fetch resolves late. The generation/controller guards in ResourceCell
    // must make this a no-op: no throw, value stays null.
    expect(() => resolveFetch('late')).not.toThrow();
    await settleResourceWork();

    expect(snapshot!.value).toBe(null);
  });

  it('should abort a pending resource on unmount and ignore late completion', async () => {
    let resolveFetch!: (v: string) => void;
    let aborts = 0;
    let snapshot: { value: string | null; pending: boolean } | null = null;

    const App = (): JSXElement => {
      const result = resource<string>(
        ({ signal }) =>
          new Promise<string>((resolve) => {
            resolveFetch = resolve;
            signal.addEventListener('abort', () => {
              aborts += 1;
            });
          }),
        []
      );
      snapshot = result;

      return <div>{result.value ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.textContent).toBe('loading');
    expect(snapshot!.pending).toBe(true);

    cleanup();

    expect(aborts).toBe(1);

    expect(() => resolveFetch('late')).not.toThrow();
    await settleResourceWork();

    expect(snapshot!.value).toBe(null);
    expect(snapshot!.pending).toBe(true);
  });

  it.each(['unkeyed', 'keyed'] as const)(
    'should clean a component replaced by a bare %s conditional branch',
    async (mode) => {
      let setVisible!: (visible: boolean) => void;
      let resolveFetch!: (value: string) => void;
      let aborts = 0;
      let cleanups = 0;

      function Child() {
        const result = resource<string>(
          ({ signal }) =>
            new Promise<string>((resolve) => {
              resolveFetch = resolve;
              signal.addEventListener('abort', () => {
                aborts += 1;
              });
            }),
          []
        );
        task(() => () => {
          cleanups += 1;
        });

        return (
          <div id={'conditional-child'}>
            {result.pending ? 'pending' : result.value}
          </div>
        );
      }

      function App() {
        const visible = state(true);
        setVisible = visible.set;

        return (
          <section>
            {visible() ? (
              <Child key={mode === 'keyed' ? 'slot' : undefined} />
            ) : (
              <div
                key={mode === 'keyed' ? 'slot' : undefined}
                id={'conditional-fallback'}
              >
                {'gone'}
              </div>
            )}
          </section>
        );
      }

      const { container, cleanup } = createTestContainer();
      try {
        createIsland({ root: container, component: App });
        flushScheduler();
        await settleResourceWork();

        expect(container.querySelector('#conditional-child')?.textContent).toBe(
          'pending'
        );

        setVisible(false);
        flushScheduler();

        expect(container.querySelector('#conditional-child')).toBeNull();
        expect(
          container.querySelector('#conditional-fallback')?.textContent
        ).toBe('gone');
        expect(aborts).toBe(1);
        expect(cleanups).toBe(1);

        resolveFetch('late-value');
        await settleResourceWork();

        expect(container.querySelector('#conditional-child')).toBeNull();
        expect(
          container.querySelector('#conditional-fallback')?.textContent
        ).toBe('gone');
      } finally {
        cleanup();
      }
    }
  );

  it('should clean a component host reused by the bulk intrinsic path', async () => {
    const previousThreshold = process.env.ASKR_BULK_TEXT_THRESHOLD;
    process.env.ASKR_BULK_TEXT_THRESHOLD = '2';
    let replaceWithIntrinsic!: State<boolean>;
    let resourceAborts = 0;

    function Child() {
      resource<string>(
        ({ signal }) =>
          new Promise<string>(() => {
            signal.addEventListener('abort', () => {
              resourceAborts += 1;
            });
          }),
        []
      );
      return <div id={'bulk-child'}>{'pending'}</div>;
    }

    function App() {
      replaceWithIntrinsic = state(false);
      return (
        <section>
          {replaceWithIntrinsic() ? (
            <div id={'bulk-fallback'}>{'gone'}</div>
          ) : (
            <Child />
          )}
          <span>{'tail'}</span>
        </section>
      );
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();

      replaceWithIntrinsic.set(true);
      flushScheduler();

      expect(container.querySelector('#bulk-child')).toBeNull();
      expect(container.querySelector('#bulk-fallback')?.textContent).toBe(
        'gone'
      );
      expect(resourceAborts).toBe(1);
    } finally {
      cleanup();
      if (previousThreshold === undefined) {
        delete process.env.ASKR_BULK_TEXT_THRESHOLD;
      } else {
        process.env.ASKR_BULK_TEXT_THRESHOLD = previousThreshold;
      }
    }
  });

  it('should preserve a bare component owner when a later sibling fails', async () => {
    let replaceWithIntrinsic!: State<boolean>;
    let failLater!: State<boolean>;
    let count!: State<number>;
    let resourceAborts = 0;
    let cleanups = 0;

    function Child() {
      count = state(0);
      resource<string>(
        ({ signal }) =>
          new Promise<string>(() => {
            signal.addEventListener('abort', () => {
              resourceAborts += 1;
            });
          }),
        []
      );
      task(() => () => {
        cleanups += 1;
      });

      return (
        <div id={'rollback-child'}>
          <button onClick={() => count.set((value) => value + 1)}>
            {`count=${count()}`}
          </button>
        </div>
      );
    }

    function Later(props: { fail: boolean }) {
      if (props.fail) {
        throw new Error('later sibling failed');
      }
      return <span data-later-sibling={'true'}>{'stable'}</span>;
    }

    function App() {
      replaceWithIntrinsic = state(false);
      failLater = state(false);

      return (
        <section>
          {replaceWithIntrinsic() ? (
            <div id={'rollback-fallback'}>{'gone'}</div>
          ) : (
            <Child />
          )}
          <Later fail={failLater()} />
        </section>
      );
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();

      const child = container.querySelector('#rollback-child');
      replaceWithIntrinsic.set(true);
      failLater.set(true);
      expect(() => flushScheduler()).toThrow('later sibling failed');

      expect(container.querySelector('#rollback-child')).toBe(child);
      expect(container.querySelector('#rollback-fallback')).toBeNull();
      expect(resourceAborts).toBe(0);
      expect(cleanups).toBe(0);

      count.set(1);
      flushScheduler();
      expect(
        container.querySelector('#rollback-child button')?.textContent
      ).toBe('count=1');

      failLater.set(false);
      flushScheduler();

      expect(container.querySelector('#rollback-child')).toBeNull();
      expect(container.querySelector('#rollback-fallback')?.textContent).toBe(
        'gone'
      );
      expect(resourceAborts).toBe(1);
      expect(cleanups).toBe(1);
    } finally {
      cleanup();
    }
  });

  it.each(['stable', 'fallback'] as const)(
    'should clean a component owner during a %s same-key For patch',
    async (patchMode) => {
      type Row = { id: number; intrinsic: boolean };
      let rows!: State<Row[]>;
      let resourceAborts = 0;

      function Child() {
        resource<string>(
          ({ signal }) =>
            new Promise<string>(() => {
              signal.addEventListener('abort', () => {
                resourceAborts += 1;
              });
            }),
          []
        );
        return patchMode === 'stable' ? (
          <div id={'for-patch-child'}>{'pending'}</div>
        ) : (
          <div id={'for-patch-child'}>
            <span>{'pending'}</span>
          </div>
        );
      }

      function App() {
        rows = state<Row[]>([{ id: 1, intrinsic: false }]);
        return (
          <main>
            <For each={rows} by={(row) => row.id}>
              {(row) =>
                row.intrinsic ? (
                  patchMode === 'stable' ? (
                    <div id={'for-patch-fallback'}>{'gone'}</div>
                  ) : (
                    <div id={'for-patch-fallback'}>
                      <span>{'gone'}</span>
                      <span>{'extra'}</span>
                    </div>
                  )
                ) : (
                  <Child />
                )
              }
            </For>
          </main>
        );
      }

      const { container, cleanup } = createTestContainer();
      try {
        createIsland({ root: container, component: App });
        flushScheduler();
        await settleResourceWork();

        rows.set([{ id: 1, intrinsic: true }]);
        flushScheduler();

        expect(container.querySelector('#for-patch-child')).toBeNull();
        expect(
          container.querySelector('#for-patch-fallback')?.textContent
        ).toBe(patchMode === 'stable' ? 'gone' : 'goneextra');
        expect(resourceAborts).toBe(1);
      } finally {
        cleanup();
      }
    }
  );

  it.each([
    { mode: 'forced', count: 10 },
    { mode: 'renderer', count: 65 },
  ] as const)(
    'should clean a component owner during the $mode keyed fast path',
    async ({ mode, count }) => {
      const previousForcedBulk = process.env.ASKR_FORCE_BULK_POSREUSE;
      if (mode === 'forced') {
        process.env.ASKR_FORCE_BULK_POSREUSE = '1';
      } else {
        delete process.env.ASKR_FORCE_BULK_POSREUSE;
      }
      let switchRows!: State<boolean>;
      let resourceAborts = 0;

      function Child() {
        resource<string>(
          ({ signal }) =>
            new Promise<string>(() => {
              signal.addEventListener('abort', () => {
                resourceAborts += 1;
              });
            }),
          []
        );
        return <div data-fast-row={'0'}>{'pending'}</div>;
      }

      function App() {
        switchRows = state(false);
        const switched = switchRows();
        const keys = Array.from({ length: count }, (_, index) => index);
        if (mode === 'renderer' && switched) {
          keys.reverse();
        }

        return (
          <section>
            {keys.map((key) =>
              key === 0 && !switched ? (
                <Child key={key} />
              ) : (
                <div key={key} data-fast-row={String(key)}>
                  {key === 0 ? 'gone' : String(key)}
                </div>
              )
            )}
          </section>
        );
      }

      const { container, cleanup } = createTestContainer();
      try {
        createIsland({ root: container, component: App });
        flushScheduler();
        await settleResourceWork();

        switchRows.set(true);
        flushScheduler();

        expect(
          container.querySelector('[data-fast-row="0"]')?.textContent
        ).toBe('gone');
        expect(resourceAborts).toBe(1);
      } finally {
        cleanup();
        if (previousForcedBulk === undefined) {
          delete process.env.ASKR_FORCE_BULK_POSREUSE;
        } else {
          process.env.ASKR_FORCE_BULK_POSREUSE = previousForcedBulk;
        }
      }
    }
  );

  it('should isolate a stale resource from a Show remount in the same slot', async () => {
    let setVisible!: (visible: boolean) => void;
    const resolvers: Array<(value: string) => void> = [];
    let aborts = 0;

    function Child() {
      const result = resource<string>(
        ({ signal }) =>
          new Promise<string>((resolve) => {
            resolvers.push(resolve);
            signal.addEventListener('abort', () => {
              aborts += 1;
            });
          }),
        []
      );

      return (
        <p data-show-resource={'true'}>
          {result.pending ? 'pending' : result.value}
        </p>
      );
    }

    function App() {
      const visible = state(true);
      setVisible = visible.set;
      return (
        <main>
          <Show when={visible}>
            <Child />
          </Show>
        </main>
      );
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      const initialElement = container.querySelector('[data-show-resource]');

      setVisible(false);
      flushScheduler();
      setVisible(true);
      flushScheduler();

      expect(aborts).toBe(1);
      expect(resolvers).toHaveLength(2);
      expect(container.querySelector('[data-show-resource]')).not.toBe(
        initialElement
      );
      expect(container.querySelector('[data-show-resource]')?.textContent).toBe(
        'pending'
      );

      resolvers[0]!('stale');
      await settleResourceWork();
      expect(container.querySelector('[data-show-resource]')?.textContent).toBe(
        'pending'
      );

      resolvers[1]!('fresh');
      await settleResourceWork();
      expect(container.querySelector('[data-show-resource]')?.textContent).toBe(
        'fresh'
      );
    } finally {
      cleanup();
    }
  });

  it('should isolate a stale resource when a For key is removed and reused', async () => {
    type Row = { id: number };
    let rows!: State<Row[]>;
    const resolvers: Array<(value: string) => void> = [];
    let aborts = 0;

    function RowView(props: { row: Row }) {
      const result = resource<string>(
        ({ signal }) =>
          new Promise<string>((resolve) => {
            resolvers.push(resolve);
            signal.addEventListener('abort', () => {
              aborts += 1;
            });
          }),
        []
      );

      return (
        <p data-row-resource={String(props.row.id)}>
          {result.pending ? 'pending' : result.value}
        </p>
      );
    }

    function App() {
      rows = state<Row[]>([{ id: 1 }]);
      return (
        <main>
          <For each={rows} by={(row) => row.id}>
            {(row) => <RowView row={row} />}
          </For>
        </main>
      );
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      const initialElement = container.querySelector('[data-row-resource]');

      rows.set([]);
      flushScheduler();
      rows.set([{ id: 1 }]);
      flushScheduler();

      expect(aborts).toBe(1);
      expect(resolvers).toHaveLength(2);
      expect(container.querySelector('[data-row-resource]')).not.toBe(
        initialElement
      );
      expect(container.querySelector('[data-row-resource]')?.textContent).toBe(
        'pending'
      );

      resolvers[0]!('stale');
      await settleResourceWork();
      expect(container.querySelector('[data-row-resource]')?.textContent).toBe(
        'pending'
      );

      resolvers[1]!('fresh');
      await settleResourceWork();
      expect(container.querySelector('[data-row-resource]')?.textContent).toBe(
        'fresh'
      );
    } finally {
      cleanup();
    }
  });
});
