import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import { createSPA } from '@askrjs/askr/boot';
import { route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('state reactivity with createSPA', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    resetRouteState();
  });

  afterEach(() => cleanup());

  it('should re-render when state changes in SPA route component', async () => {
    function Counter() {
      const count = state(0);

      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Counter Demo</h2>
          <p data-testid="count">Count: {count()}</p>
          <button
            data-testid="increment"
            onClick={() => count.set((c) => c + 1)}
          >
            Increment
          </button>
          <button
            data-testid="decrement"
            onClick={() => count.set((c) => Math.max(0, c - 1))}
          >
            Decrement
          </button>
        </div>
      );
    }

    route('/', () => <Counter />);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    // Initial state
    const countP = container.querySelector('[data-testid="count"]');
    expect(countP?.textContent).toBe('Count: 0');

    // Click increment button
    const incrementBtn = container.querySelector(
      '[data-testid="increment"]'
    ) as HTMLButtonElement;
    incrementBtn.click();
    flushScheduler();

    // Should update to 1
    expect(countP?.textContent).toBe('Count: 1');

    // Click increment again
    incrementBtn.click();
    flushScheduler();

    // Should update to 2
    expect(countP?.textContent).toBe('Count: 2');

    // Click decrement
    const decrementBtn = container.querySelector(
      '[data-testid="decrement"]'
    ) as HTMLButtonElement;
    decrementBtn.click();
    flushScheduler();

    // Should update to 1
    expect(countP?.textContent).toBe('Count: 1');
  });
});
