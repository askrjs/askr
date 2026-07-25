import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createIsland, createSPA, cleanupApp, hasApp } from '@askrjs/askr/boot';
import { state, type State } from '../../../src';
import { getSignal } from '../../../src/resources';
import { getCurrentInstance } from '../../../src/runtime';
import { navigate } from '../../../src/router/navigate';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

const EXECUTION_MODEL_KEY = Symbol.for('__ASKR_EXECUTION_MODEL__');

async function settleNavigation(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await Promise.resolve();
    flushScheduler();
  }
}

async function mountIsolatedSpas(
  rootA: HTMLDivElement,
  rootB: HTMLDivElement
): Promise<void> {
  await createSPA({
    root: rootA,
    registry: routeRegistryFromTable([
      {
        path: '/start',
        handler: () => <div id={'app-a'}>{'A start'}</div>,
      },
      {
        path: '/next',
        handler: () => <div id={'app-a'}>{'A next'}</div>,
      },
    ]),
  });

  await createSPA({
    root: rootB,
    registry: routeRegistryFromTable([
      {
        path: '/start',
        handler: () => <div id={'app-b'}>{'B start'}</div>,
      },
      {
        path: '/next',
        handler: () => <div id={'app-b'}>{'B next'}</div>,
      },
    ]),
  });
}

describe('multi-root SPA isolation', () => {
  let rootA: HTMLDivElement;
  let rootB: HTMLDivElement;
  let cleanupA: () => void;
  let cleanupB: () => void;

  beforeEach(() => {
    const first = createTestContainer();
    rootA = first.container;
    cleanupA = first.cleanup;

    const second = createTestContainer();
    rootB = second.container;
    cleanupB = second.cleanup;

    window.history.replaceState({}, '', '/start');
  });

  afterEach(() => {
    cleanupApp(rootB);
    cleanupApp(rootA);
    cleanupB();
    cleanupA();
    window.history.replaceState({}, '', '/');
    delete (globalThis as unknown as Record<string | symbol, unknown>)[
      EXECUTION_MODEL_KEY
    ];
  });

  it('should keep two SPAs independently routable across the same browser navigation', async () => {
    await mountIsolatedSpas(rootA, rootB);

    await settleNavigation();

    expect(rootA.textContent).toBe('A start');
    expect(rootB.textContent).toBe('B start');

    navigate('/next');
    await settleNavigation();

    expect(rootA.textContent).toBe('A next');
    expect(rootB.textContent).toBe('B next');
  });

  it('should roll back every root when one destination fails', async () => {
    let shared: State<number> | undefined;
    let candidateAborts = 0;
    let candidateCleanups = 0;
    let restoredRenders = 0;
    await createSPA({
      root: rootA,
      registry: routeRegistryFromTable([
        {
          path: '/start',
          handler: () => {
            restoredRenders += 1;
            shared ??= state(0);
            return <div id={'app-a'}>{`A start ${shared()}`}</div>;
          },
        },
        {
          path: '/next',
          handler: () => {
            const candidateState = state(0);
            getSignal().addEventListener('abort', () => {
              candidateAborts += 1;
            });
            const instance = getCurrentInstance()!;
            (instance.cleanupFns ??= []).push(() => {
              candidateCleanups += 1;
              candidateState.set(1);
            });
            return (
              <div id={'app-a'}>
                {`A next ${shared!()} ${candidateState()}`}
              </div>
            );
          },
        },
      ]),
    });

    await createSPA({
      root: rootB,
      registry: routeRegistryFromTable([
        {
          path: '/start',
          handler: () => <div id={'app-b'}>{'B start'}</div>,
        },
        {
          path: '/next',
          handler: () => {
            throw new Error('B destination failed');
          },
        },
      ]),
    });

    await settleNavigation();

    expect(() => navigate('/next')).toThrow('B destination failed');
    expect(rootA.textContent).toBe('A start 0');
    expect(rootB.textContent).toBe('B start');
    expect(window.location.pathname).toBe('/start');
    expect(candidateAborts).toBe(1);
    expect(candidateCleanups).toBe(1);

    flushScheduler();
    expect(restoredRenders).toBe(1);

    shared!.set(1);
    flushScheduler();

    expect(rootA.textContent).toBe('A start 1');
  });

  it('should boot concurrent roots from their own route sources', async () => {
    await Promise.all([
      createSPA({
        root: rootA,
        registry: routeRegistryFromTable([
          {
            path: '/start',
            handler: () => <div id={'concurrent-a'}>{'A concurrent'}</div>,
          },
        ]),
      }),
      createSPA({
        root: rootB,
        registry: routeRegistryFromTable([
          {
            path: '/start',
            handler: () => <div id={'concurrent-b'}>{'B concurrent'}</div>,
          },
        ]),
      }),
    ]);
    await settleNavigation();

    expect(rootA.textContent).toBe('A concurrent');
    expect(rootB.textContent).toBe('B concurrent');
  });

  it('should keep both SPAs in sync when browser history triggers popstate', async () => {
    await mountIsolatedSpas(rootA, rootB);
    await settleNavigation();

    navigate('/next');
    await settleNavigation();

    expect(rootA.textContent).toBe('A next');
    expect(rootB.textContent).toBe('B next');

    window.history.replaceState({ path: '/start' }, '', '/start');
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: { path: '/start' } })
    );
    await settleNavigation();

    expect(rootA.textContent).toBe('A start');
    expect(rootB.textContent).toBe('B start');
  });

  it('should keep a sibling island interactive after cleanupApp(rootA)', () => {
    const IslandA = () => {
      const count = state(0);
      return (
        <button id={'island-a'} onClick={() => count.set(count() + 1)}>
          {`A ${String(count())}`}
        </button>
      );
    };

    const IslandB = () => {
      const count = state(0);
      return (
        <button id={'island-b'} onClick={() => count.set(count() + 1)}>
          {`B ${String(count())}`}
        </button>
      );
    };

    createIsland({ root: rootA, component: IslandA });
    createIsland({ root: rootB, component: IslandB });
    flushScheduler();

    expect(hasApp(rootA)).toBe(true);
    expect(hasApp(rootB)).toBe(true);

    cleanupApp(rootA);

    expect(hasApp(rootA)).toBe(false);
    expect(hasApp(rootB)).toBe(true);
    expect(rootB.textContent).toBe('B 0');

    const buttonB = rootB.querySelector('#island-b') as HTMLButtonElement;
    buttonB.click();
    flushScheduler();

    expect(rootB.textContent).toBe('B 1');
  });
});
