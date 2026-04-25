import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import { createTestContainer, flushScheduler } from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('state reactivity bug reproduction', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  it('should re-render component when state changes via button click', () => {
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

    createIsland({ root: container, component: Counter });
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
