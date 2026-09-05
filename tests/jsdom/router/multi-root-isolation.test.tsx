import { routeRegistryFromTable } from '../../router-test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createIsland, createSPA, cleanupApp, hasApp } from '@askrjs/askr/boot';
import { state, type State } from '../../../src';
import { Link } from '../../../src/components/link';
import { getSignal } from '../../../src/resources';
import { getCurrentInstance } from '../../../src/runtime';
import { isRoutePathActive, onRouteChange } from '../../../src/router/activity';
import { navigate } from '../../../src/router/navigate';
import {
  createRouteRegistry,
  currentRoute,
  resolveRouteRequest,
  route,
} from '../../../src/router/route';
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
            (instance.owner.cleanups ??= []).push(() => {
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

  it('should keep route activity scoped to the root after another base path mounts', async () => {
    let rerenderA: (() => void) | undefined;
    let appANavigationAuthenticated: boolean | undefined;
    let appBAuthResolutions = 0;
    const observedPaths: string[] = [];
    const registryA = createRouteRegistry(
      () => {
        route('/dash', () => {
          const renders = state(0);
          rerenderA = () => renders.set((value) => value + 1);
          const snapshot = currentRoute();
          onRouteChange(
            (nextRoute) => {
              observedPaths.push(nextRoute.path);
            },
            { immediate: true }
          );

          return (
            <div
              data-active={String(isRoutePathActive('/dash'))}
              data-path={snapshot.path}
            >
              <span>{String(renders())}</span>
              <Link href="/next">Next</Link>
            </div>
          );
        });
        route('/next', () => <div>{'A next'}</div>, {
          policies: [
            (context) => {
              appANavigationAuthenticated = context.auth.authenticated;
              return { kind: 'allow' };
            },
          ],
        });
      },
      { basePath: '/app-a' }
    );
    const registryB = createRouteRegistry(
      () => route('/dash', () => <div>{'B dash'}</div>),
      {
        basePath: '/app-b',
        auth: {
          resolve: () => {
            appBAuthResolutions += 1;
            return {
              authenticated: true,
              principal: { id: 'app-b-user', roles: ['member'] },
              session: null,
              tenant: null,
            };
          },
        },
      }
    );

    window.history.replaceState({}, '', '/app-a/dash');
    await createSPA({ root: rootA, registry: registryA });
    await settleNavigation();

    expect(rootA.firstElementChild?.getAttribute('data-path')).toBe('/dash');
    expect(rootA.firstElementChild?.getAttribute('data-active')).toBe('true');
    expect(observedPaths).toEqual(['/dash']);

    await createSPA({ root: rootB, registry: registryB });
    await settleNavigation();
    rerenderA?.();
    flushScheduler();

    expect(rootA.firstElementChild?.getAttribute('data-path')).toBe('/dash');
    expect(rootA.firstElementChild?.getAttribute('data-active')).toBe('true');
    expect(rootA.querySelector('span')?.textContent).toBe('1');
    expect(rootA.querySelector('a')?.getAttribute('href')).toBe('/app-a/next');
    expect(observedPaths).toEqual(['/dash']);

    (rootA.querySelector('a') as HTMLAnchorElement).click();
    await settleNavigation();

    expect(window.location.pathname).toBe('/app-a/next');
    expect(rootA.textContent).toBe('A next');
    expect(appANavigationAuthenticated).toBe(false);
    expect(appBAuthResolutions).toBe(0);
  });

  it('should keep config auth scoped to event-triggered route resolution', async () => {
    let resolvedPrincipal: string | undefined;
    const authResolutions: string[] = [];
    let registryA!: ReturnType<typeof createRouteRegistry>;
    registryA = createRouteRegistry(() => {
      route('/start', () => (
        <button
          id="resolve-a"
          onClick={() => {
            resolveRouteRequest('/private', { registry: registryA });
          }}
        >
          Resolve A
        </button>
      ));
      route('/private', () => <div>{'A private'}</div>, {
        policies: [
          (context) => {
            resolvedPrincipal = context.auth.principal?.id;
            return { kind: 'allow' };
          },
        ],
      });
    });
    const registryB = createRouteRegistry(() =>
      route('/start', () => <div>{'B start'}</div>)
    );

    await createSPA({
      root: rootA,
      registry: registryA,
      auth: {
        resolve: () => {
          authResolutions.push('A');
          return {
            authenticated: true,
            principal: { id: 'app-a-user', roles: ['member'] },
            session: null,
            tenant: null,
          };
        },
      },
    });
    await createSPA({
      root: rootB,
      registry: registryB,
      auth: {
        resolve: () => {
          authResolutions.push('B');
          return {
            authenticated: true,
            principal: { id: 'app-b-user', roles: ['member'] },
            session: null,
            tenant: null,
          };
        },
      },
    });
    await settleNavigation();
    authResolutions.length = 0;

    (rootA.querySelector('#resolve-a') as HTMLButtonElement).click();

    expect(authResolutions).toEqual(['A']);
    expect(resolvedPrincipal).toBe('app-a-user');
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
