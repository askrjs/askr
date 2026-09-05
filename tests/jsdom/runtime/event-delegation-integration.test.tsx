// tests/runtime/event-delegation-integration.test.tsx
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import { createIsland } from '@askrjs/askr/boot';
import {
  disableEventDelegation,
  enableEventDelegation,
  setGlobalDelegationContainer,
} from '../../../src/renderer/events';
import {
  createTestContainer,
  flushScheduler,
  fireEvent,
} from '../../../test-utils/render/test-renderer';

describe('event delegation integration (RUNTIME)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    enableEventDelegation(); // Ensure delegation is enabled
    setGlobalDelegationContainer(document.body); // Reset to document.body
  });
  afterEach(() => {
    cleanup();
    enableEventDelegation();
    setGlobalDelegationContainer(document.body);
  });

  describe('multiple islands with delegation', () => {
    it('should handle events across multiple islands', () => {
      let clicks1 = 0;
      let clicks2 = 0;

      const Island1 = () => {
        return (
          <button id="btn1" onClick={() => clicks1++}>
            Island 1
          </button>
        );
      };

      const Island2 = () => {
        return (
          <button id="btn2" onClick={() => clicks2++}>
            Island 2
          </button>
        );
      };

      const container1 = document.createElement('div');
      const container2 = document.createElement('div');
      document.body.appendChild(container1);
      document.body.appendChild(container2);

      try {
        createIsland({ root: container1, component: Island1 });
        createIsland({ root: container2, component: Island2 });
        flushScheduler();

        const btn1 = container1.querySelector('#btn1') as HTMLButtonElement;
        const btn2 = container2.querySelector('#btn2') as HTMLButtonElement;

        fireEvent.click(btn1);
        flushScheduler();
        expect(clicks1).toBe(1);
        expect(clicks2).toBe(0);

        fireEvent.click(btn2);
        flushScheduler();
        expect(clicks1).toBe(1);
        expect(clicks2).toBe(1);
      } finally {
        container1.remove();
        container2.remove();
      }
    });

    it('should handle delegation container changes across islands', () => {
      let clicks = 0;

      const Component = () => {
        return (
          <button id="btn" onClick={() => clicks++}>
            Click
          </button>
        );
      };

      const customContainer = document.createElement('div');
      customContainer.id = 'custom';
      document.body.appendChild(customContainer);
      const island = document.createElement('div');
      customContainer.appendChild(island);

      // Set custom container BEFORE creating the island
      setGlobalDelegationContainer(customContainer);

      try {
        createIsland({ root: island, component: Component });
        flushScheduler();

        const btn = island.querySelector('#btn') as HTMLButtonElement;

        // Reset to default before clicking to test whether delegation was set up on custom container
        setGlobalDelegationContainer(document.body);

        fireEvent.click(btn);
        flushScheduler();

        // Should still work since delegation was attached to custom container at creation time
        expect(clicks).toBeGreaterThanOrEqual(1);
      } finally {
        customContainer.remove();
      }
    });
  });

  describe('event delegation with dynamic content', () => {
    it('should handle events on dynamically added elements', () => {
      let clickCount = 0;

      const Component = () => {
        const show = state(false);
        return (
          <div>
            <button id="toggle" onClick={() => show.set(!show())}>
              Toggle
            </button>
            {show() && (
              <button id="dynamic" onClick={() => clickCount++}>
                Dynamic
              </button>
            )}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      expect(container.querySelector('#dynamic')).toBeNull();

      // Show dynamic button
      const toggle = container.querySelector('#toggle') as HTMLButtonElement;
      fireEvent.click(toggle);
      flushScheduler();

      const dynamicBtn = container.querySelector(
        '#dynamic'
      ) as HTMLButtonElement;
      expect(dynamicBtn).not.toBeNull();

      // Click dynamic button
      fireEvent.click(dynamicBtn);
      flushScheduler();

      expect(clickCount).toBe(1);
    });

    it('should handle events on conditionally rendered nested components', () => {
      let nestedClicks = 0;

      const NestedComponent = () => {
        return (
          <button id="nested" onClick={() => nestedClicks++}>
            Nested
          </button>
        );
      };

      const Component = () => {
        const show = state(false);
        return (
          <div>
            <button id="toggle" onClick={() => show.set(!show())}>
              Toggle
            </button>
            {show() && <NestedComponent />}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      // Show nested component
      const toggle = container.querySelector('#toggle') as HTMLButtonElement;
      fireEvent.click(toggle);
      flushScheduler();

      const nested = container.querySelector('#nested') as HTMLButtonElement;
      fireEvent.click(nested);
      flushScheduler();

      expect(nestedClicks).toBe(1);
    });
  });

  describe('event delegation with lists', () => {
    it('should handle events on list items with keys', () => {
      const clicks: number[] = [];

      const Component = () => {
        const items = state([1, 2, 3]);
        return (
          <div>
            {items().map((item) => (
              <button
                key={item}
                id={`btn-${item}`}
                onClick={() => clicks.push(item)}
              >
                Item {item}
              </button>
            ))}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const btn1 = container.querySelector('#btn-1') as HTMLButtonElement;
      const btn2 = container.querySelector('#btn-2') as HTMLButtonElement;
      const btn3 = container.querySelector('#btn-3') as HTMLButtonElement;

      fireEvent.click(btn1);
      fireEvent.click(btn3);
      fireEvent.click(btn2);
      flushScheduler();

      expect(clicks).toEqual([1, 3, 2]);
    });

    it('should preserve event handlers after list reordering', () => {
      const clicks: string[] = [];

      const Component = () => {
        const items = state(['a', 'b', 'c']);
        return (
          <div>
            <button
              id="reverse"
              onClick={() => items.set([...items()].reverse())}
            >
              Reverse
            </button>
            {items().map((item) => (
              <button
                key={item}
                id={`btn-${item}`}
                onClick={() => clicks.push(item)}
              >
                {item}
              </button>
            ))}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      // Click before reorder
      const btnA = container.querySelector('#btn-a') as HTMLButtonElement;
      fireEvent.click(btnA);
      flushScheduler();
      expect(clicks).toEqual(['a']);

      // Reverse list
      const reverse = container.querySelector('#reverse') as HTMLButtonElement;
      fireEvent.click(reverse);
      flushScheduler();

      // Click after reorder - element identity should be preserved
      const btnAAfter = container.querySelector('#btn-a') as HTMLButtonElement;
      fireEvent.click(btnAAfter);
      flushScheduler();
      expect(clicks).toEqual(['a', 'a']);
    });
  });

  describe('event delegation with state updates', () => {
    it('should trigger scheduler flush after delegated events', () => {
      let renderCount = 0;

      const Component = () => {
        renderCount++;
        const count = state(0);
        return (
          <div>
            <button id="btn" onClick={() => count.set(count() + 1)}>
              Count: {count()}
            </button>
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const initialRenders = renderCount;

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      fireEvent.click(btn);
      flushScheduler();

      expect(renderCount).toBeGreaterThan(initialRenders);
      expect(btn.textContent).toBe('Count: 1');
    });

    it('should batch multiple state updates within delegated handler', () => {
      let renderCount = 0;

      const Component = () => {
        renderCount++;
        const count1 = state(0);
        const count2 = state(0);
        return (
          <div>
            <button
              id="btn"
              onClick={() => {
                count1.set(count1() + 1);
                count2.set(count2() + 1);
              }}
            >
              Click
            </button>
            <span id="display">
              {count1()} - {count2()}
            </span>
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const initialRenders = renderCount;

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      fireEvent.click(btn);
      flushScheduler();

      const display = container.querySelector('#display') as HTMLSpanElement;
      expect(display.textContent).toBe('1 - 1');

      // Should only render once for both updates (batched)
      expect(renderCount).toBe(initialRenders + 1);
    });
  });

  describe('event delegation cleanup', () => {
    it('should remove delegated listeners on island cleanup', () => {
      let clicks = 0;

      const Component = () => {
        return (
          <button id="btn" onClick={() => clicks++}>
            Click
          </button>
        );
      };

      createIsland({
        root: container,
        component: Component,
      });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      fireEvent.click(btn);
      flushScheduler();
      expect(clicks).toBe(1);

      // Cleanup island using the container cleanup function
      cleanup();

      // Click after cleanup should not trigger handler
      fireEvent.click(btn);
      flushScheduler();
      expect(clicks).toBe(1); // Still 1, not incremented
    });

    it('should handle cleanup of multiple event types', () => {
      let clicks = 0;
      let changes = 0;

      const Component = () => {
        return (
          <div>
            <button id="btn" onClick={() => clicks++}>
              Button
            </button>
            <input id="input" onInput={() => changes++} />
          </div>
        );
      };

      createIsland({
        root: container,
        component: Component,
      });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      const input = container.querySelector('#input') as HTMLInputElement;

      fireEvent.click(btn);
      fireEvent.input(input);
      flushScheduler();

      expect(clicks).toBe(1);
      expect(changes).toBe(1);

      // Cleanup using container cleanup
      cleanup();

      // Events after cleanup should not trigger
      fireEvent.click(btn);
      fireEvent.input(input);
      flushScheduler();

      expect(clicks).toBe(1);
      expect(changes).toBe(1);
    });
  });

  describe('delegation edge cases', () => {
    it('should handle delegation toggle mid-render', () => {
      let clicks = 0;

      // Disable delegation
      disableEventDelegation();

      const Component = () => {
        return (
          <button id="btn" onClick={() => clicks++}>
            Click
          </button>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      fireEvent.click(btn);
      flushScheduler();
      expect(clicks).toBe(1);

      // Re-enable delegation (won't affect existing listeners)
      enableEventDelegation();

      fireEvent.click(btn);
      flushScheduler();
      expect(clicks).toBe(2);
    });

    it('should handle events with falsy children', () => {
      let clicks = 0;

      const Component = () => {
        return (
          <div>
            <button id="zero" onClick={() => clicks++}>
              {0}
            </button>
            <button id="false" onClick={() => clicks++}>
              {String(false)}
            </button>
            <button id="empty" onClick={() => clicks++}>
              {''}
            </button>
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const btnZero = container.querySelector('#zero') as HTMLButtonElement;
      const btnFalse = container.querySelector('#false') as HTMLButtonElement;
      const btnEmpty = container.querySelector('#empty') as HTMLButtonElement;

      expect(btnZero.textContent).toBe('0');
      expect(btnFalse.textContent).toBe('false');
      expect(btnEmpty.textContent).toBe('');

      fireEvent.click(btnZero);
      fireEvent.click(btnFalse);
      fireEvent.click(btnEmpty);
      flushScheduler();

      expect(clicks).toBe(3);
    });

    it('should handle rapid event firing', () => {
      let clickCount = 0;

      const Component = () => {
        return (
          <button id="btn" onClick={() => clickCount++}>
            Click
          </button>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;

      // Fire 10 clicks rapidly
      for (let i = 0; i < 10; i++) {
        fireEvent.click(btn);
      }
      flushScheduler();

      expect(clickCount).toBe(10);
    });
  });
});
