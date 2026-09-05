import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { For } from '../../../src/control';
import {
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { getSignal, resource, task } from '../../../src/resources';
import { getCurrentInstance } from '../../../src/runtime';
import {
  beginLifecycleCommitBatch,
  discardLifecycleCommitBatch,
  flushLifecycleCommitBatch,
} from '../../../src/runtime/component-lifecycle';
import { state, type State } from '../../../src/runtime/state';
import { getVNodeComponentInstance } from '../../../src/renderer/component-host-instances';
import { teardownNodeSubtree } from '../../../src/renderer/cleanup';
import { createDOMNode } from '../../../src/renderer/dom';
import type { JSXElement } from '../../../src/jsx/types';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('provisional component ownership rollback', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
    _resetDefaultPortal();
  });

  it('should clean a fresh owner chain deepest-first and permit same-vnode recovery', async () => {
    let shouldFail = true;
    const abortOrder: string[] = [];
    const abortCounts = new Map<string, number>();
    const loaders = new Map<string, ReturnType<typeof vi.fn>>();
    const starts = new Map<string, ReturnType<typeof vi.fn>>();

    const trackOwner = (name: string): void => {
      const signal = getSignal();
      signal.addEventListener('abort', () => {
        abortOrder.push(name);
        abortCounts.set(name, (abortCounts.get(name) ?? 0) + 1);
      });

      const loader = vi.fn(async () => name);
      const start = vi.fn();
      loaders.set(name, loader);
      starts.set(name, start);
      resource(loader, []);
      task(start);
    };

    function DeepOwner() {
      trackOwner('deep');
      if (shouldFail) {
        const instance = getCurrentInstance()!;
        instance.cleanupStrict = true;
        (instance.ownership.cleanups ??= []).push(() => {
          throw new Error('deep cleanup failed');
        });
        throw new Error('fresh owner primary failure');
      }
      return <div data-mounted={'true'}>{'mounted'}</div>;
    }

    function MiddleOwner() {
      trackOwner('middle');
      return <DeepOwner />;
    }

    function OuterOwner() {
      trackOwner('outer');
      return <MiddleOwner />;
    }

    const sharedVNode = <OuterOwner />;
    const App = () => sharedVNode;

    expect(() => createIsland({ root: container, component: App })).toThrow(
      'fresh owner primary failure'
    );
    expect(abortOrder).toEqual(['deep', 'middle', 'outer']);
    expect(Array.from(abortCounts.values())).toEqual([1, 1, 1]);
    expect(getVNodeComponentInstance(sharedVNode)).toBeUndefined();

    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();
    for (const loader of loaders.values()) {
      expect(loader).not.toHaveBeenCalled();
    }
    for (const start of starts.values()) {
      expect(start).not.toHaveBeenCalled();
    }

    shouldFail = false;
    expect(() =>
      createIsland({ root: container, component: App })
    ).not.toThrow();
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector('[data-mounted="true"]')).not.toBeNull();
    expect(getVNodeComponentInstance(sharedVNode)).toBeDefined();
    expect(abortOrder).toEqual(['deep', 'middle', 'outer']);
  });

  it('should clean incoming retained-host owners without disposing the retained owner', async () => {
    type Row = { id: number; incoming: boolean };

    let rows!: State<Row[]>;
    let incomingShouldFail = true;
    let retainedClicks = 0;
    let retainedAborts = 0;
    const incomingAbortOrder: string[] = [];
    const incomingAbortCounts = new Map<string, number>();
    const incomingLoaders: Array<ReturnType<typeof vi.fn>> = [];
    const incomingStarts: Array<ReturnType<typeof vi.fn>> = [];

    const trackIncoming = (name: string): void => {
      const signal = getSignal();
      signal.addEventListener('abort', () => {
        incomingAbortOrder.push(name);
        incomingAbortCounts.set(name, (incomingAbortCounts.get(name) ?? 0) + 1);
      });
      const loader = vi.fn(async () => name);
      const start = vi.fn();
      incomingLoaders.push(loader);
      incomingStarts.push(start);
      resource(loader, []);
      task(start);
    };

    function RetainedOwner() {
      const signal = getSignal();
      signal.addEventListener('abort', () => {
        retainedAborts += 1;
      });
      return (
        <div data-owner={'retained'}>
          <button
            data-click={'retained'}
            onClick={() => {
              retainedClicks += 1;
            }}
          >
            {'retained'}
          </button>
          <Portal>
            <aside data-portal={'retained'}>{'retained portal'}</aside>
          </Portal>
        </div>
      );
    }

    function IncomingInner() {
      trackIncoming('inner');
      if (incomingShouldFail) {
        const instance = getCurrentInstance()!;
        instance.cleanupStrict = true;
        (instance.ownership.cleanups ??= []).push(() => {
          throw new Error('incoming cleanup failed');
        });
        throw new Error('retained nested primary failure');
      }
      return (
        <div data-owner={'incoming'}>
          <Portal>
            <aside data-portal={'incoming'}>{'incoming portal'}</aside>
          </Portal>
        </div>
      );
    }

    const sharedInnerVNode = <IncomingInner />;
    function IncomingOuter() {
      trackIncoming('outer');
      return sharedInnerVNode;
    }
    const sharedOuterVNode = <IncomingOuter />;

    function App(): JSXElement {
      rows = state<Row[]>([{ id: 1, incoming: false }]);
      return (
        <main>
          <For each={rows} by={(row) => row.id}>
            {(row) => (row.incoming ? sharedOuterVNode : <RetainedOwner />)}
          </For>
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    const retainedHost = container.querySelector('[data-owner="retained"]');
    const retainedButton = container.querySelector(
      '[data-click="retained"]'
    ) as HTMLButtonElement;
    expect(container.querySelector('[data-portal="retained"]')).not.toBeNull();

    rows.set([{ id: 1, incoming: true }]);
    expect(() => flushScheduler()).toThrow('retained nested primary failure');

    expect(container.querySelector('[data-owner="retained"]')).toBe(
      retainedHost
    );
    expect(container.querySelector('[data-owner="incoming"]')).toBeNull();
    expect(container.querySelector('[data-portal="retained"]')).not.toBeNull();
    expect(container.querySelector('[data-portal="incoming"]')).toBeNull();
    expect(retainedAborts).toBe(0);
    expect(incomingAbortOrder).toEqual(['inner', 'outer']);
    expect(Array.from(incomingAbortCounts.values())).toEqual([1, 1]);
    expect(getVNodeComponentInstance(sharedOuterVNode)).toBeUndefined();
    expect(getVNodeComponentInstance(sharedInnerVNode)).toBeUndefined();
    for (const loader of incomingLoaders) {
      expect(loader).not.toHaveBeenCalled();
    }
    for (const start of incomingStarts) {
      expect(start).not.toHaveBeenCalled();
    }

    retainedButton.click();
    flushScheduler();
    expect(retainedClicks).toBe(1);

    incomingShouldFail = false;
    rows.set([{ id: 1, incoming: true }]);
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector('[data-owner="incoming"]')).toBe(
      retainedHost
    );
    expect(container.querySelector('[data-portal="retained"]')).toBeNull();
    expect(container.querySelector('[data-portal="incoming"]')).not.toBeNull();
    expect(retainedAborts).toBe(1);
    expect(incomingAbortOrder).toEqual(['inner', 'outer']);
  });

  it('should restore fresh static-vnode owners when a later sibling fails', () => {
    type Row = {
      id: number;
      kind: 'retained' | 'incoming' | 'stable' | 'broken';
    };

    let rows!: State<Row[]>;
    const abortOrder: string[] = [];

    function RetainedOwner() {
      return <div data-owner={'retained'}>{'retained'}</div>;
    }

    function IncomingInner() {
      getSignal().addEventListener('abort', () => {
        abortOrder.push('inner');
      });
      return <div data-owner={'incoming'}>{'incoming'}</div>;
    }

    const sharedInnerVNode = <IncomingInner />;
    function IncomingOuter() {
      getSignal().addEventListener('abort', () => {
        abortOrder.push('outer');
      });
      return sharedInnerVNode;
    }
    const sharedOuterVNode = <IncomingOuter />;

    function LaterOwner({ kind }: { kind: Row['kind'] }) {
      if (kind === 'broken') {
        throw new Error('later sibling failed');
      }
      return <span data-later={'stable'}>{'stable'}</span>;
    }

    function App(): JSXElement {
      rows = state<Row[]>([
        { id: 1, kind: 'retained' },
        { id: 2, kind: 'stable' },
      ]);
      return (
        <main>
          <For each={rows} by={(row) => row.id}>
            {(row) =>
              row.id === 1 ? (
                row.kind === 'incoming' ? (
                  sharedOuterVNode
                ) : (
                  <RetainedOwner />
                )
              ) : (
                <LaterOwner kind={row.kind} />
              )
            }
          </For>
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    const retainedHost = container.querySelector('[data-owner="retained"]');

    rows.set([
      { id: 1, kind: 'incoming' },
      { id: 2, kind: 'broken' },
    ]);
    expect(() => flushScheduler()).toThrow('later sibling failed');

    expect(container.querySelector('[data-owner="retained"]')).toBe(
      retainedHost
    );
    expect(container.querySelector('[data-owner="incoming"]')).toBeNull();
    expect(abortOrder).toEqual(['inner', 'outer']);
    expect(getVNodeComponentInstance(sharedOuterVNode)).toBeUndefined();
    expect(getVNodeComponentInstance(sharedInnerVNode)).toBeUndefined();

    rows.set([
      { id: 1, kind: 'incoming' },
      { id: 2, kind: 'stable' },
    ]);
    flushScheduler();

    expect(container.querySelector('[data-owner="incoming"]')).toBe(
      retainedHost
    );
    expect(container.querySelector('[data-later="stable"]')).not.toBeNull();
    expect(abortOrder).toEqual(['inner', 'outer']);
  });

  it('should clean an outgoing descendant before an incoming top owner writes its portal', () => {
    let replace!: State<boolean>;
    let outgoingAborts = 0;

    function OutgoingPortalOwner() {
      getSignal().addEventListener('abort', () => {
        outgoingAborts += 1;
      });
      Portal({
        children: <aside data-portal={'outgoing'}>{'outgoing portal'}</aside>,
      });
      return <span data-descendant={'outgoing'}>{'outgoing'}</span>;
    }

    function ReplacingOwner({ incoming }: { incoming: boolean }) {
      if (incoming) {
        Portal({
          children: <aside data-portal={'incoming'}>{'incoming portal'}</aside>,
        });
        return <article data-root={'incoming'}>{'incoming'}</article>;
      }

      return (
        <button data-root={'outgoing'}>
          <OutgoingPortalOwner />
        </button>
      );
    }

    function App(): JSXElement {
      replace = state(false);
      return (
        <main>
          <ReplacingOwner incoming={replace()} />
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const outgoingRoot = container.querySelector('[data-root="outgoing"]')!;
    expect(container.querySelector('[data-portal="outgoing"]')).not.toBeNull();

    replace.set(true);
    flushScheduler();

    expect(outgoingRoot.isConnected).toBe(false);
    expect(container.querySelector('[data-root="incoming"]')).not.toBeNull();
    expect(container.querySelector('[data-portal="outgoing"]')).toBeNull();
    expect(container.querySelector('[data-portal="incoming"]')).not.toBeNull();
    expect(outgoingAborts).toBe(1);
  });

  it('should retain reused wrapper-chain owners across text updates', () => {
    let label!: State<string>;
    let nestedAborts = 0;
    const nestedSignals: AbortSignal[] = [];

    function NestedText({ value }: { value: string }) {
      const signal = getSignal();
      if (!nestedSignals.includes(signal)) {
        nestedSignals.push(signal);
        signal.addEventListener('abort', () => {
          nestedAborts += 1;
        });
      }
      return value;
    }

    function WrapperOwner({ value }: { value: string }) {
      return <NestedText value={value} />;
    }

    function App(): JSXElement {
      label = state('first');
      return (
        <main>
          <WrapperOwner value={label()} />
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.textContent).toContain('first');
    expect(nestedSignals).toHaveLength(1);

    label.set('second');
    flushScheduler();

    expect(container.textContent).toContain('second');
    expect(nestedSignals).toHaveLength(1);
    expect(nestedAborts).toBe(0);
  });

  it.each([
    ['intrinsic', false, false],
    ['intrinsic', true, false],
    ['intrinsic', false, true],
    ['intrinsic', true, true],
    ['fragment', false, false],
    ['fragment', true, false],
    ['fragment', false, true],
    ['fragment', true, true],
    ['array', false, false],
    ['array', true, false],
    ['array', false, true],
    ['array', true, true],
  ] as const)(
    'should clean off-tree %s owners after a later sibling failure (frozen=%s, batched=%s)',
    (shape, frozen, batched) => {
      let shouldFail = true;
      let renders = 0;
      let aborts = 0;

      function GoodOwner() {
        renders += 1;
        const attempt = state(renders);
        getSignal().addEventListener('abort', () => {
          aborts += 1;
        });
        return <span data-attempt={String(attempt())}>{attempt()}</span>;
      }

      function LaterOwner() {
        if (shouldFail) {
          throw new Error('off-tree later sibling failed');
        }
        return <span data-later={'stable'}>{'stable'}</span>;
      }

      const mutableGoodVNode = <GoodOwner key={'good'} />;
      const mutableLaterVNode = <LaterOwner key={'later'} />;
      const sharedGoodVNode = frozen
        ? Object.freeze(mutableGoodVNode)
        : mutableGoodVNode;
      const sharedLaterVNode = frozen
        ? Object.freeze(mutableLaterVNode)
        : mutableLaterVNode;

      const createTree = (): unknown => {
        const children = [sharedGoodVNode, sharedLaterVNode];
        if (shape === 'array') {
          return children;
        }
        if (shape === 'fragment') {
          return (
            <>
              {sharedGoodVNode}
              {sharedLaterVNode}
            </>
          );
        }
        return (
          <main>
            {sharedGoodVNode}
            {sharedLaterVNode}
          </main>
        );
      };

      const materialize = (): Node | null => {
        if (!batched) {
          return createDOMNode(createTree());
        }

        const batch = beginLifecycleCommitBatch();
        try {
          const dom = createDOMNode(createTree());
          flushLifecycleCommitBatch(batch);
          return dom;
        } catch (error) {
          discardLifecycleCommitBatch(batch);
          throw error;
        }
      };

      expect(materialize).toThrow('off-tree later sibling failed');
      expect(aborts).toBe(1);
      expect(getVNodeComponentInstance(sharedGoodVNode)).toBeUndefined();

      shouldFail = false;
      const recovered = materialize();
      expect(recovered).not.toBeNull();
      container.appendChild(recovered!);

      expect(container.querySelector('[data-attempt="2"]')).not.toBeNull();
      expect(container.querySelector('[data-later="stable"]')).not.toBeNull();
      expect(renders).toBe(2);

      for (const child of Array.from(container.childNodes)) {
        teardownNodeSubtree(child);
        child.remove();
      }
      expect(aborts).toBe(2);
      expect(getVNodeComponentInstance(sharedGoodVNode)).toBeUndefined();
    }
  );
});
