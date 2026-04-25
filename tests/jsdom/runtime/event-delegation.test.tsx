/**
 * Event Delegation Tests
 *
 * Validates the event delegation system works correctly in opt-out mode:
 * - Delegation is enabled by default
 * - Can be disabled globally
 * - Delegates common events (click, input, etc.)
 * - Handlers execute correctly
 * - Scheduler integration works
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import {
  createTestContainer,
  flushScheduler,
  fireEvent,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../src/boot';
import {
  isEventDelegationEnabled,
  disableEventDelegation,
  enableEventDelegation,
  setGlobalDelegationContainer,
  isDelegatedEvent,
  getDelegatedHandlerForElement,
} from '../../../src/runtime/events';
import { state } from '../../../src/runtime/state';

describe('event delegation', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    // Ensure delegation is enabled for tests
    enableEventDelegation();
  });

  afterEach(() => {
    cleanup();
    // Reset to default state
    enableEventDelegation();
  });

  describe('delegation state management', () => {
    it('should be enabled by default', () => {
      expect(isEventDelegationEnabled()).toBe(true);
    });

    it('should allow disabling delegation', () => {
      disableEventDelegation();
      expect(isEventDelegationEnabled()).toBe(false);
    });

    it('should allow re-enabling delegation', () => {
      disableEventDelegation();
      enableEventDelegation();
      expect(isEventDelegationEnabled()).toBe(true);
    });

    it('should identify delegated event types', () => {
      expect(isDelegatedEvent('click')).toBe(true);
      expect(isDelegatedEvent('input')).toBe(true);
      expect(isDelegatedEvent('change')).toBe(true);
      expect(isDelegatedEvent('customEvent')).toBe(false);
    });
  });

  describe('delegated click events', () => {
    it('should handle click events when delegation enabled', () => {
      let clicks = 0;
      const Component = () => (
        <button id="btn" onClick={() => (clicks += 1)}>
          Click me
        </button>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      fireEvent.click(btn);
      flushScheduler();

      expect(clicks).toBe(1);
    });

    it('should update delegated handlers in place across rerenders', () => {
      let mode: ReturnType<typeof state<'a' | 'b'>> | null = null;
      const calls: string[] = [];

      const Component = () => {
        mode = state<'a' | 'b'>('a');
        return (
          <button id="btn" onClick={() => calls.push(mode!())}>
            {mode!()}
          </button>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const button = container.querySelector('#btn') as HTMLButtonElement;
      const initialEntry = getDelegatedHandlerForElement(button, 'click');

      expect(initialEntry).toBeDefined();
      button.click();
      flushScheduler();
      expect(calls).toEqual(['a']);

      mode!.set('b');
      flushScheduler();

      const updatedEntry = getDelegatedHandlerForElement(button, 'click');
      expect(updatedEntry).toBe(initialEntry);

      button.click();
      flushScheduler();
      expect(calls).toEqual(['a', 'b']);
    });

    it('should handle multiple clicks', () => {
      let clicks = 0;
      const Component = () => (
        <button id="btn" onClick={() => (clicks += 1)}>
          Click me
        </button>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
      flushScheduler();

      expect(clicks).toBe(3);
    });

    it('should handle clicks on multiple elements', () => {
      const clicks: number[] = [];
      const Component = () => (
        <div>
          <button id="btn1" onClick={() => clicks.push(1)}>
            Button 1
          </button>
          <button id="btn2" onClick={() => clicks.push(2)}>
            Button 2
          </button>
          <button id="btn3" onClick={() => clicks.push(3)}>
            Button 3
          </button>
        </div>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      fireEvent.click(container.querySelector('#btn1') as HTMLElement);
      fireEvent.click(container.querySelector('#btn2') as HTMLElement);
      fireEvent.click(container.querySelector('#btn3') as HTMLElement);
      flushScheduler();

      expect(clicks).toEqual([1, 2, 3]);
    });
  });

  describe('delegated input events', () => {
    it('should handle input events', () => {
      let value = '';
      const Component = () => (
        <input
          id="input"
          onInput={(e: Event) => (value = (e.target as HTMLInputElement).value)}
        />
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      const input = container.querySelector('#input') as HTMLInputElement;
      fireEvent.input(input, 'test');
      flushScheduler();

      expect(value).toBe('test');
    });

    it('should handle change events', () => {
      let value = '';
      const Component = () => (
        <input
          id="input"
          onChange={(e: Event) =>
            (value = (e.target as HTMLInputElement).value)
          }
        />
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      const input = container.querySelector('#input') as HTMLInputElement;
      fireEvent.change(input, 'changed');
      flushScheduler();

      expect(value).toBe('changed');
    });
  });

  describe('delegation with state updates', () => {
    it('should trigger reactivity when delegated handler updates state', () => {
      let getCount: (() => number) | undefined;
      const Component = () => {
        const count = state(0);
        getCount = count;
        return (
          <div>
            <button id="btn" onClick={() => count.set(count() + 1)}>
              Increment
            </button>
            <span id="count">{count()}</span>
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      fireEvent.click(container.querySelector('#btn') as HTMLElement);
      flushScheduler();

      expect(container.querySelector('#count')?.textContent).toBe('1');
      expect(getCount!()).toBe(1);
    });

    it('should flush delegated DOM updates synchronously after click', () => {
      const Component = () => {
        const count = state(0);
        return (
          <button id="btn" onClick={() => count.set(count() + 1)}>
            {count()}
          </button>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      fireEvent.click(btn);

      expect(btn.textContent).toBe('1');
    });

    it('should batch state updates in delegated handlers', () => {
      const updates: number[] = [];
      let getCount: (() => number) | undefined;

      const Component = () => {
        const count = state(0);
        getCount = count;
        updates.push(count());
        return (
          <button
            id="btn"
            onClick={() => {
              count.set(count() + 1);
              count.set(count() + 1);
              count.set(count() + 1);
            }}
          >
            count: {count()}
          </button>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      updates.length = 0; // Clear initial render

      fireEvent.click(container.querySelector('#btn') as HTMLElement);
      flushScheduler();

      // Should batch the three updates into one re-render
      expect(updates.length).toBe(1);
      expect(getCount!()).toBe(3);
    });
  });

  describe('delegation opt-out', () => {
    it('should use direct listeners when delegation disabled', () => {
      disableEventDelegation();

      let clicks = 0;
      const Component = () => (
        <button id="btn" onClick={() => (clicks += 1)}>
          Click me
        </button>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      fireEvent.click(btn);
      flushScheduler();

      expect(clicks).toBe(1);
    });

    it('should work after toggling delegation', () => {
      // Start with delegation enabled
      let clicks = 0;
      const Component = () => (
        <button id="btn" onClick={() => (clicks += 1)}>
          Click me
        </button>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      fireEvent.click(container.querySelector('#btn') as HTMLElement);
      flushScheduler();
      expect(clicks).toBe(1);

      // Disable and verify it still works with a new component
      disableEventDelegation();
      cleanup();

      const result2 = createTestContainer();
      container = result2.container;
      cleanup = result2.cleanup;

      clicks = 0;
      createIsland({ root: container, component: Component });
      flushScheduler();

      fireEvent.click(container.querySelector('#btn') as HTMLElement);
      flushScheduler();
      expect(clicks).toBe(1);
    });
  });

  describe('custom delegation container', () => {
    it('should allow setting custom delegation container', () => {
      const customContainer = document.createElement('div');
      customContainer.id = 'custom-container';
      document.body.appendChild(customContainer);

      // Create test container as child of custom container
      const testContainer = document.createElement('div');
      testContainer.id = 'test-root';
      customContainer.appendChild(testContainer);

      try {
        // Set container before mounting
        setGlobalDelegationContainer(customContainer);

        let clicks = 0;
        const Component = () => (
          <button id="btn" onClick={() => (clicks += 1)}>
            Click me
          </button>
        );

        createIsland({ root: testContainer, component: Component });
        flushScheduler();

        fireEvent.click(testContainer.querySelector('#btn') as HTMLElement);
        flushScheduler();

        expect(clicks).toBe(1);
      } finally {
        document.body.removeChild(customContainer);
        // Reset to default
        setGlobalDelegationContainer(document.body);
      }
    });
  });

  describe('multiple event types', () => {
    it('should delegate multiple event types on same element', () => {
      const events: string[] = [];
      const Component = () => (
        <button
          id="btn"
          onClick={() => events.push('click')}
          onMouseOver={() => events.push('mouseover')}
          onFocus={() => events.push('focus')}
        >
          Multi-event
        </button>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      fireEvent.click(btn);
      const mouseoverEvent = new MouseEvent('mouseover', { bubbles: true });
      btn.dispatchEvent(mouseoverEvent);
      const focusEvent = new FocusEvent('focus', { bubbles: true });
      btn.dispatchEvent(focusEvent);
      flushScheduler();

      expect(events).toEqual(['click', 'mouseover', 'focus']);
    });
  });

  describe('event bubbling', () => {
    it('should handle events that bubble through delegation', () => {
      const clicks: string[] = [];
      const Component = () => (
        <div id="outer" onClick={() => clicks.push('outer')}>
          <div id="middle" onClick={() => clicks.push('middle')}>
            <button id="inner" onClick={() => clicks.push('inner')}>
              Button
            </button>
          </div>
        </div>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      fireEvent.click(container.querySelector('#inner') as HTMLElement);
      flushScheduler();

      // Should execute all handlers in bubbling order
      expect(clicks).toEqual(['inner', 'middle', 'outer']);
    });

    it('should stop propagation when requested', () => {
      const clicks: string[] = [];
      const Component = () => (
        <div id="outer" onClick={() => clicks.push('outer')}>
          <button
            id="inner"
            onClick={(e: Event) => {
              clicks.push('inner');
              e.stopPropagation();
            }}
          >
            Button
          </button>
        </div>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      fireEvent.click(container.querySelector('#inner') as HTMLElement);
      flushScheduler();

      // Should only execute inner handler
      expect(clicks).toEqual(['inner']);
    });
  });
});
