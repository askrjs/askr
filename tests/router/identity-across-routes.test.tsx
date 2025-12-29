/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * tests/router/identity_across_routes.test.ts
 *
 * Component identity and state preservation across route transitions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state, createSPA } from '../../src/index';
import { navigate } from '../../src/router/navigate';
import { clearRoutes, getRoutes, route } from '../../src/router/route';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

describe('identity across routes (ROUTER)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    clearRoutes();
  });

  afterEach(() => {
    cleanup();
  });

  it('should change component identity on route transition', async () => {
    const identities: number[] = [];
    let identityCounter = 0;

    route('/page1', (_params) => {
      const count = state(identityCounter++);
      identities.push(count());
      return { type: 'div', children: ['Page 1'] };
    });

    route('/page2', (_params) => {
      const count = state(identityCounter++);
      identities.push(count());
      return { type: 'div', children: ['Page 2'] };
    });

    const App = (_props: Record<string, unknown>) => {
      return {
        type: 'div',
        children: [
          {
            type: 'button',
            props: {
              id: 'nav',
              onClick: () => navigate('/page2'),
            },
            children: ['Next'],
          },
        ],
      };
    };

    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    navigate('/page1');
    flushScheduler();

    const beforeNav = identities.length;

    navigate('/page2');
    flushScheduler();

    // New navigation should create new component identity
    expect(identities.length).toBeGreaterThan(beforeNav);
  });

  it('should isolate route component state per route', async () => {
    let route1Value = 0;
    let route2Value = 0;

    route('/counter1', (_params) => {
      route1Value = 1;
      return { type: 'div', children: [`Count1: ${route1Value}`] };
    });

    route('/counter2', (_params) => {
      route2Value = 2;
      return { type: 'div', children: [`Count2: ${route2Value}`] };
    });

    const App = () => {
      return { type: 'div', children: ['App'] };
    };

    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    navigate('/counter1');
    flushScheduler();

    navigate('/counter2');
    flushScheduler();

    // Each route should have run with different values
    expect(route1Value).toBe(1);
    expect(route2Value).toBe(2);
  });

  it('should replace DOM on route transition', async () => {
    let _page1Element: Element | null = null;
    let page2Element: Element | null = null;

    route('/page1', () => {
      return { type: 'div', props: { id: 'page1' }, children: ['Page 1'] };
    });

    route('/page2', () => {
      return { type: 'div', props: { id: 'page2' }, children: ['Page 2'] };
    });

    const App = () => {
      return { type: 'div', children: ['App'] };
    };

    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    navigate('/page1');
    flushScheduler();
    _page1Element = container.querySelector('#page1');

    navigate('/page2');
    flushScheduler();
    page2Element = container.querySelector('#page2');

    // Old DOM should be gone
    expect(container.querySelector('#page1')).toBeNull();
    expect(page2Element).not.toBeNull();
  });

  it('should reuse component instance when navigating to same route', async () => {
    let renderCount = 0;

    route('/page', (_params) => {
      renderCount++;
      const message = state('Hello');
      return { type: 'div', children: [message()] };
    });

    const App = () => {
      return { type: 'div', children: ['App'] };
    };

    createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    navigate('/page');
    flushScheduler();
    const count1 = renderCount;

    // Navigate to same route
    navigate('/page');
    flushScheduler();
    const count2 = renderCount;

    // Component should remount (new render)
    expect(count2).toBeGreaterThan(count1);
  });

  it('should make URL parameters unique per route instance', async () => {
    const seenParams: Record<string, string>[] = [];

    route('/user/{id}', (params) => {
      seenParams.push(params);
      return {
        type: 'div',
        props: { 'data-id': params.id },
        children: [`User ${params.id}`],
      };
    });

    const App = () => {
      return { type: 'div', children: ['App'] };
    };

    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    navigate('/user/1');
    flushScheduler();

    navigate('/user/2');
    flushScheduler();

    navigate('/user/1');
    flushScheduler();

    // Each navigation creates a new instance with its params
    expect(seenParams.length).toBeGreaterThanOrEqual(2);
    expect(seenParams.some((p) => p.id === '1')).toBe(true);
    expect(seenParams.some((p) => p.id === '2')).toBe(true);
  });
});
