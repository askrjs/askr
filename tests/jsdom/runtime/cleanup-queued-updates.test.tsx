import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src';
import {
  createComponentInstance,
  getCurrentComponentInstance,
  renderComponentInline,
  type ComponentInstance,
} from '../../../src/runtime';
import { evaluate } from '../../../src/renderer/evaluation/evaluate';
import {
  beginCommitTransaction,
  finalizeInlineReadSubscriptions,
  commitTransaction,
} from '../../../src/runtime/component/lifecycle';
import { definePortal } from '../../../src/runtime/portal/portal';
import type { ReadableSource } from '../../../src/runtime/reactivity/readable';
import { globalScheduler } from '../../../src/runtime/scheduler';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../../../test-utils/render/test-renderer';

describe('cleanup with queued updates', () => {
  it('should not apply older prepared output after a newer inline render commits', () => {
    const view = createTestContainer();
    let owner!: ComponentInstance;
    let source!: ReturnType<typeof state<number>>;
    let label = 'old';
    createIsland({
      root: view.container,
      component: () => {
        owner = getCurrentComponentInstance()!;
        source = state(0);
        return <div>{`${label}:${source()}`}</div>;
      },
    });
    flushScheduler();
    source.set(1);
    globalScheduler.enqueue(() => {
      label = 'new';
      evaluate(renderComponentInline(owner), owner.target);
    });
    try {
      flushScheduler();
      expect(view.container.textContent).toBe('new:1');
      expect(source._readers?.has(owner)).toBe(true);
      expect(owner.owner.mounted).toBe(true);
    } finally {
      view.cleanup();
    }
  });

  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should not execute a queued state rerender after cleanup before scheduler flush', () => {
    let renders = 0;
    let increment!: () => void;

    const App = () => {
      renders += 1;
      const count = state(0);
      increment = () => count.set((value) => value + 1);
      return <div>{count()}</div>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(renders).toBe(1);
    expect(container.textContent).toBe('0');

    increment();
    cleanup();

    expect(() => flushScheduler()).not.toThrow();
    expect(renders).toBe(1);
    expect(getSchedulerState().queueLength).toBe(0);
  });

  it('should not execute a queued child subscriber after root cleanup before scheduler flush', () => {
    let shared!: ReturnType<typeof state<number>>;
    let childRenders = 0;

    const Child = () => {
      childRenders += 1;
      return <div>{shared()}</div>;
    };

    const App = () => {
      shared = state(0);
      return (
        <section>
          <Child />
        </section>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(childRenders).toBe(1);
    expect(container.textContent).toBe('0');

    shared.set(1);
    cleanup();

    const readers = (shared as unknown as { _readers?: Map<unknown, unknown> })
      ._readers;
    expect(readers?.size ?? 0).toBe(0);

    expect(() => flushScheduler()).not.toThrow();
    expect(childRenders).toBe(1);
    expect(getSchedulerState().queueLength).toBe(0);
  });

  it('should not commit a rendered result after cleanup runs before its DOM commit', () => {
    type InstanceHost = Node & {
      __ASKR_INSTANCE?: ComponentInstance;
      __ASKR_INSTANCES?: ComponentInstance[];
    };

    const OverlayPortal = definePortal();
    let owner!: ComponentInstance;
    let update!: () => void;

    function PortalWriter({ label }: { label: string }) {
      return OverlayPortal.render({
        children: <strong data-overlay={'true'}>{label}</strong>,
      }) as null;
    }

    function App() {
      owner = getCurrentComponentInstance()!;
      const version = state(0);
      update = () => version.set((value) => value + 1);
      const label = `overlay:${version()}`;
      return (
        <section data-owner={'queued-commit'}>
          <OverlayPortal />
          <PortalWriter label={label} />
        </section>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const instances = new Set<ComponentInstance>();
    const walker = document.createTreeWalker(container, 0xffffffff);
    let node: Node | null = walker.currentNode;
    while (node) {
      const host = node as InstanceHost;
      if (host.__ASKR_INSTANCE) instances.add(host.__ASKR_INSTANCE);
      for (const instance of host.__ASKR_INSTANCES ?? []) {
        instances.add(instance);
      }
      node = walker.nextNode();
    }

    const portalInstance = Array.from(instances).find(
      (instance) => instance.fn === OverlayPortal
    );
    const portalSource = portalInstance?.owner.reads?.values().next().value as
      | ReadableSource<unknown>
      | undefined;

    expect(portalInstance).toBeDefined();
    expect(portalSource?._readers?.size).toBe(1);
    expect(container.textContent).toContain('overlay:0');

    update();
    globalScheduler.enqueue(() => cleanup());
    flushScheduler();

    expect(owner.owner.mounted).toBe(false);
    expect(owner.target?.isConnected).toBe(false);
    expect(portalInstance?.owner.mounted).toBe(false);
    expect(portalSource?._readers?.has(portalInstance!)).toBe(false);
    expect(portalSource?._readers?.size ?? 0).toBe(0);
    expect(container.textContent).not.toContain('overlay:1');
    expect(getSchedulerState().queueLength).toBe(0);

    const deferredReader = createComponentInstance(
      'deferred-reader-generation',
      () => null,
      {},
      null
    );
    deferredReader.owner.mounted = true;
    deferredReader.notifyUpdate = () => {};
    const deferredSource = (() => 0) as ReadableSource<number>;
    deferredSource._version = 0;
    const deferredBatch = beginCommitTransaction();
    finalizeInlineReadSubscriptions(
      deferredReader,
      1,
      new Set([deferredSource]),
      new Map([[deferredSource, 0]])
    );
    deferredReader.owner.identity = {};
    commitTransaction(deferredBatch);

    expect(deferredSource._readers?.has(deferredReader)).not.toBe(true);
  });
});
