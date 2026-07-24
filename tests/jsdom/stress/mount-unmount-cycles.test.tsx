import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
// tests/stress/mount_unmount_cycles.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import { cleanupApp, createIsland, createSPA } from '@askrjs/askr/boot';
import { Show } from '../../../src/control';
import { getCurrentComponentInstance } from '../../../src/runtime/component';
import { navigate } from '../../../src/router/navigate';
import { route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../../../test-utils/render/test-renderer';

const EXECUTION_MODEL_KEY = Symbol.for('__ASKR_EXECUTION_MODEL__');

function resetExecutionModel(): void {
  delete (globalThis as unknown as Record<string | symbol, unknown>)[
    EXECUTION_MODEL_KEY
  ];
}

describe('mount unmount cycles (STRESS)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should leave no state when mounted and unmounted 100 times', async () => {
    for (let i = 0; i < 100; i++) {
      const { container: local, cleanup: localCleanup } = createTestContainer();
      let counter: ReturnType<typeof state<number>> | null = null;
      const Component = () => {
        counter = state(0);
        return <div>{String(counter())}</div>;
      };

      createIsland({ root: local, component: Component });
      flushScheduler();

      counter!.set(1);
      flushScheduler();
      expect(local.textContent).toBe('1');

      localCleanup();
    }

    const s = getSchedulerState();
    expect(s.running).toBe(false);
    expect(s.queueLength).toBe(0);
  }, 15000);

  it('should survive when rapidly created and destroyed', async () => {
    let counter: ReturnType<typeof state<number>> | null = null;

    const Component = () => {
      counter = state(0);
      return (
        <button id="btn" onClick={() => counter!.set(counter!() + 1)}>
          {String(counter())}
        </button>
      );
    };

    // Rapidly remount the same component (common in MFEs)
    for (let i = 0; i < 25; i++) {
      createIsland({ root: container, component: Component });
    }
    flushScheduler();

    const button = container.querySelector('#btn') as HTMLButtonElement;
    button.click();
    flushScheduler();

    expect(container.textContent).toBe('1');
  });

  it('should clean up listeners properly after mount/unmount cycles', async () => {
    let clicks = 0;

    const WithListener = () => (
      <button id={'btn'} onClick={() => (clicks += 1)}>
        {'click'}
      </button>
    );
    const WithoutListener = () => <div>{'gone'}</div>;

    createIsland({ root: container, component: WithListener });
    flushScheduler();

    const oldButton = container.querySelector('#btn') as HTMLButtonElement;
    oldButton.click();
    expect(clicks).toBe(1);

    // Remove the button from the tree.
    createIsland({ root: container, component: WithoutListener });
    flushScheduler();
    expect(container.querySelector('#btn')).toBeNull();

    // Even if someone holds a reference, unmount should detach resources.
    oldButton.click();
    expect(clicks).toBe(1);
  });

  it('should survive repeated routed branch switch and unmount cycles', async () => {
    resetExecutionModel();

    for (let cycle = 0; cycle < 5; cycle += 1) {
      resetRouteState();
      window.history.replaceState({}, '', '/dashboard');
      const { container: local, cleanup: localCleanup } = createTestContainer();
      let detailCleanups = 0;

      const Details = () => {
        const instance = getCurrentComponentInstance();
        if (!instance) {
          throw new Error('expected details component instance');
        }
        (instance.cleanupFns ??= []).push(() => {
          detailCleanups += 1;
        });

        return <p id={'details'}>{`details:${String(cycle)}`}</p>;
      };

      route('/dashboard', () => {
        const open = state(true);

        return (
          <section id={'dashboard'}>
            <button
              id={'toggle-details'}
              onClick={() => open.set((value) => !value)}
            >
              {'toggle'}
            </button>
            <Show when={open}>
              <Details />
            </Show>
          </section>
        );
      });
      route('/settings', () => <section id={'settings'}>{'settings'}</section>);

      try {
        await createSPA({ root: local, registry: currentRouteRegistry() });
        flushScheduler();

        expect(local.querySelector('#details')?.textContent).toBe(
          `details:${String(cycle)}`
        );

        (local.querySelector('#toggle-details') as HTMLButtonElement).click();
        flushScheduler();

        expect(local.querySelector('#details')).toBeNull();
        expect(detailCleanups).toBe(1);

        navigate('/settings');
        flushScheduler();

        expect(local.querySelector('#settings')?.textContent).toBe('settings');

        navigate('/dashboard');
        flushScheduler();

        expect(local.querySelector('#details')?.textContent).toBe(
          `details:${String(cycle)}`
        );

        cleanupApp(local);
        expect(detailCleanups).toBe(2);
      } finally {
        localCleanup();
      }
    }

    resetRouteState();
    window.history.replaceState({}, '', '/');
    resetExecutionModel();
    expect(getSchedulerState()).toMatchObject({
      queueLength: 0,
      running: false,
    });
  });
});
