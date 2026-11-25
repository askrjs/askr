import { resetRouteState, currentRouteRegistry } from '../../router-test-utils';
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * tests/router/identity_across_routes.test.ts
 *
 * Component identity and state preservation across route transitions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import { createSPA } from '@askrjs/askr/boot';
import { navigate } from '../../../src/router/navigate';
import { route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('identity across routes (ROUTER)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    resetRouteState();
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
      return <div>Page 1</div>;
    });

    route('/page2', (_params) => {
      const count = state(identityCounter++);
      identities.push(count());
      return <div>Page 2</div>;
    });

    const App = (_props: Record<string, unknown>) => {
      return (
        <div>
          <button id="nav" onClick={() => navigate('/page2')}>
            Next
          </button>
        </div>
      );
    };

    await createSPA({ root: container, registry: currentRouteRegistry() });
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
    const Counter = ({ label }: { label: string }) => {
      const [count, setCount] = state(0);
      return (
        <button onClick={() => setCount(count() + 1)}>
          {label}: {count()}
        </button>
      );
    };
    route('/counter1', () => <Counter label="A" />);
    route('/counter2', () => <Counter label="B" />);

    const App = () => {
      return <div>App</div>;
    };

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    navigate('/counter1');
    flushScheduler();
    container.querySelector('button')!.click();
    flushScheduler();
    expect(container.textContent).toContain('A: 1');

    navigate('/counter2');
    flushScheduler();
    expect(container.textContent).toContain('B: 0');
    container.querySelector('button')!.click();
    flushScheduler();
    expect(container.textContent).toContain('B: 1');
    expect(container.textContent).not.toContain('A:');
  });

  it('should replace DOM on route transition', async () => {
    route('/page1', () => {
      return <div id="page1">Page 1</div>;
    });

    route('/page2', () => {
      return <div id="page2">Page 2</div>;
    });

    const App = () => {
      return <div>App</div>;
    };

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    navigate('/page1');
    flushScheduler();

    navigate('/page2');
    flushScheduler();
    const page2Element = container.querySelector('#page2');

    // Old DOM should be gone
    expect(container.querySelector('#page1')).toBeNull();
    expect(page2Element).not.toBeNull();
  });

  it('should reuse component instance when navigating to same route', async () => {
    let renderCount = 0;

    route('/page', (_params) => {
      renderCount++;
      const message = state('Hello');
      return <div>{message()}</div>;
    });

    const App = () => {
      return <div>App</div>;
    };

    await createSPA({ root: container, registry: currentRouteRegistry() });
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
      return <div data-id={params.id}>User {params.id}</div>;
    });

    const App = () => {
      return <div>App</div>;
    };

    await createSPA({ root: container, registry: currentRouteRegistry() });
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
