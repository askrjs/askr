import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { state } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('DefaultPortal isolation', () => {
  let cleanupA: () => void;
  let cleanupB: () => void;
  let rootA: HTMLElement;
  let rootB: HTMLElement;

  beforeEach(() => {
    const a = createTestContainer();
    const b = createTestContainer();

    rootA = a.container;
    rootB = b.container;
    cleanupA = a.cleanup;
    cleanupB = b.cleanup;
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanupA();
    cleanupB();
    _resetDefaultPortal();
  });

  it('should not mirror portal content into sibling roots', () => {
    function RootWithPortal() {
      return (
        <main>
          <div>{'root-a'}</div>
          <Portal>
            <div data-portal-owner="a">{'portal-a'}</div>
          </Portal>
        </main>
      );
    }

    function RootWithoutPortal() {
      return <main>{'root-b'}</main>;
    }

    createIsland({ root: rootA, component: RootWithPortal });
    createIsland({ root: rootB, component: RootWithoutPortal });
    flushScheduler();

    expect(rootA.querySelector('[data-portal-owner="a"]')).not.toBeNull();
    expect(rootB.querySelector('[data-portal-owner="a"]')).toBeNull();
    expect(rootB.textContent).toBe('root-b');
  });

  it('should not clear a sibling root portal during owner cleanup', () => {
    let hidePortalA: (() => void) | null = null;

    function RootA() {
      const showPortalA = state(true);
      hidePortalA = () => showPortalA.set(false);

      return (
        <main>
          <button onClick={() => hidePortalA?.()}>{'hide-a'}</button>
          {showPortalA() ? (
            <Portal>
              <div data-portal-owner="a">{'portal-a'}</div>
            </Portal>
          ) : null}
        </main>
      );
    }

    function RootB() {
      return (
        <main>
          <div>{'root-b'}</div>
          <Portal>
            <div data-portal-owner="b">{'portal-b'}</div>
          </Portal>
        </main>
      );
    }

    createIsland({ root: rootA, component: RootA });
    createIsland({ root: rootB, component: RootB });
    flushScheduler();

    expect(rootA.querySelector('[data-portal-owner="a"]')).not.toBeNull();
    expect(rootB.querySelector('[data-portal-owner="b"]')).not.toBeNull();

    (rootA.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(rootA.querySelector('[data-portal-owner="a"]')).toBeNull();
    expect(rootB.querySelector('[data-portal-owner="b"]')).not.toBeNull();
    expect(rootB.textContent).toContain('portal-b');
  });

  it('should not route an ambiguous imperative write into the last active root', () => {
    createIsland({
      root: rootA,
      component: () => <main>{'root-a'}</main>,
    });
    createIsland({
      root: rootB,
      component: () => <main>{'root-b'}</main>,
    });
    flushScheduler();

    DefaultPortal.render({ children: 'late-toast' });
    flushScheduler();

    expect(rootA.textContent).not.toContain('late-toast');
    expect(rootB.textContent).not.toContain('late-toast');
  });

  it('should not replay an ambiguous imperative write during a later root rerender', () => {
    function RootA() {
      const tick = state(0);
      return (
        <main>
          <button onClick={() => tick.set(tick() + 1)}>{`a-${tick()}`}</button>
        </main>
      );
    }

    function RootB() {
      const tick = state(0);
      return (
        <main>
          <button onClick={() => tick.set(tick() + 1)}>{`b-${tick()}`}</button>
        </main>
      );
    }

    createIsland({ root: rootA, component: RootA });
    createIsland({ root: rootB, component: RootB });
    flushScheduler();

    DefaultPortal.render({ children: 'late-toast' });
    flushScheduler();

    (rootA.querySelector('button') as HTMLButtonElement).click();
    (rootB.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(rootA.textContent).not.toContain('late-toast');
    expect(rootB.textContent).not.toContain('late-toast');
  });

  it('should keep single-root imperative writes working after the previous root cleans up', () => {
    createIsland({
      root: rootA,
      component: () => <main>{'root-a'}</main>,
    });
    flushScheduler();

    DefaultPortal.render({ children: 'toast-a' });
    flushScheduler();
    expect(rootA.textContent).toContain('toast-a');

    cleanupA();

    createIsland({
      root: rootB,
      component: () => <main>{'root-b'}</main>,
    });
    flushScheduler();

    DefaultPortal.render({ children: 'toast-b' });
    flushScheduler();

    expect(rootB.textContent).toContain('toast-b');
    expect(rootB.textContent).not.toContain('toast-a');
  });

  it('should ignore disconnected stale roots when resolving imperative writes', () => {
    createIsland({
      root: rootA,
      component: () => <main>{'root-a'}</main>,
    });
    flushScheduler();

    rootA.remove();

    createIsland({
      root: rootB,
      component: () => <main>{'root-b'}</main>,
    });
    flushScheduler();

    DefaultPortal.render({ children: 'toast-b' });
    flushScheduler();

    expect(rootB.textContent).toContain('toast-b');
  });
});
