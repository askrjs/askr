import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { resource } from '../../../src/resources';
import { createRouteRegistry, route } from '../../../src/router';
import { routeData } from '../../../src/router/deferred';
import { renderRouteRequest, renderToString } from '../../../src/ssr';
import type { JSXElement } from '../../../src/jsx/types';
import { routeRegistryFromTable } from '../../router-test-utils';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

describe('concurrent hydration resource data isolation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should hydrate each deferred root with its own resource data', async () => {
    const idleCallbacks: Array<(deadline: IdleDeadline) => void> = [];
    vi.stubGlobal(
      'requestIdleCallback',
      (callback: (deadline: IdleDeadline) => void) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }
    );
    const App = (): JSXElement => {
      const result = resource<string>(() => 'unused', []);
      return <main>{result.value}</main>;
    };
    const registry = routeRegistryFromTable([{ path: '/', handler: App }]);
    const first = createTestContainer();
    const second = createTestContainer();
    first.container.innerHTML = renderToString({
      url: '/',
      registry,
      data: { 'r:0': 'first-root' },
    });
    second.container.innerHTML = renderToString({
      url: '/',
      registry,
      data: { 'r:0': 'second-root' },
    });

    try {
      const firstHydration = hydrateSPA({
        root: first.container,
        registry,
        hydrate: { deferUntilIdle: true, verifyMarkup: false },
      });
      const secondHydration = hydrateSPA({
        root: second.container,
        registry,
        hydrate: { deferUntilIdle: true, verifyMarkup: false },
      });
      for (let index = 0; index < 20 && idleCallbacks.length < 2; index += 1) {
        await Promise.resolve();
      }
      expect(idleCallbacks).toHaveLength(2);

      idleCallbacks[0]!({ didTimeout: false, timeRemaining: () => 50 });
      await firstHydration;
      expect(first.container.querySelector('main')?.textContent).toBe(
        'first-root'
      );

      idleCallbacks[1]!({ didTimeout: false, timeRemaining: () => 50 });
      await secondHydration;
      expect(second.container.querySelector('main')?.textContent).toBe(
        'second-root'
      );
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });

  it('should hydrate each deferred root with its own route loader data', async () => {
    const idleCallbacks: Array<(deadline: IdleDeadline) => void> = [];
    vi.stubGlobal(
      'requestIdleCallback',
      (callback: (deadline: IdleDeadline) => void) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }
    );
    const registry = createRouteRegistry(() => {
      route('/{id}', () => <main>{routeData<{ id: string }>().id}</main>, {
        loader: ({ params }) => ({ id: params.id }),
      });
    });
    const first = createTestContainer();
    const second = createTestContainer();
    const firstRender = await renderRouteRequest({
      url: '/first',
      registry,
    });
    const secondRender = await renderRouteRequest({
      url: '/second',
      registry,
    });
    if (firstRender.kind !== 'render' || secondRender.kind !== 'render') {
      throw new Error('expected route render results');
    }
    first.container.innerHTML = firstRender.html;
    second.container.innerHTML = secondRender.html;

    try {
      window.history.replaceState({}, '', '/first');
      const firstHydration = hydrateSPA({
        root: first.container,
        registry,
        hydrate: { deferUntilIdle: true, verifyMarkup: false },
      });
      window.history.replaceState({}, '', '/second');
      const secondHydration = hydrateSPA({
        root: second.container,
        registry,
        hydrate: { deferUntilIdle: true, verifyMarkup: false },
      });
      for (let index = 0; index < 20 && idleCallbacks.length < 2; index += 1) {
        await Promise.resolve();
      }
      expect(idleCallbacks).toHaveLength(2);

      idleCallbacks[0]!({ didTimeout: false, timeRemaining: () => 50 });
      await firstHydration;
      expect(first.container.querySelector('main')?.textContent).toBe('first');

      idleCallbacks[1]!({ didTimeout: false, timeRemaining: () => 50 });
      await secondHydration;
      expect(second.container.querySelector('main')?.textContent).toBe(
        'second'
      );
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });
});
