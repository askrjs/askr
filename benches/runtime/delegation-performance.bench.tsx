/**
 * Event Delegation Performance Benchmark
 *
 * Measures performance difference between delegated and direct event listeners.
 * Tests various scenarios: small counts (10), medium (100), and large (1000) elements.
 *
 * Expected: Delegation should show:
 * - Lower setup time for large element counts
 * - Lower memory usage (fewer listener objects)
 * - Similar or better event dispatch performance
 */

import { bench, describe } from 'vitest';
import {
  createTestContainer,
  flushScheduler,
  fireEvent,
} from '../../tests/helpers/test-renderer';
import { createIsland } from '../../src/boot';
import {
  enableEventDelegation,
  disableEventDelegation,
} from '../../src/runtime/events';
import { state } from '../../src/runtime/state';

describe('framework::delegation::performance', () => {
  // Scenario: 10 elements (typical form)
  describe('10 elements', () => {
    bench('direct listeners', () => {
      const { container, cleanup } = createTestContainer();
      disableEventDelegation();
      const clicks = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 10 }, (_, i) => (
            <button key={i} onClick={() => clicks.set(clicks() + 1)}>
              Button {i}
            </button>
          ))}
        </div>
      );
      createIsland({ root: container, component: Component });
      flushScheduler();

      // Measure event dispatch
      const buttons = Array.from(container.querySelectorAll('button'));
      for (const btn of buttons) {
        fireEvent.click(btn as HTMLElement);
      }
      flushScheduler();
      enableEventDelegation();
      cleanup();
    });

    bench('delegated listeners', () => {
      const { container, cleanup } = createTestContainer();
      enableEventDelegation();
      const clicks = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 10 }, (_, i) => (
            <button key={i} onClick={() => clicks.set(clicks() + 1)}>
              Button {i}
            </button>
          ))}
        </div>
      );
      createIsland({ root: container, component: Component });
      flushScheduler();

      // Measure event dispatch
      const buttons = Array.from(container.querySelectorAll('button'));
      for (const btn of buttons) {
        fireEvent.click(btn as HTMLElement);
      }
      flushScheduler();
      cleanup();
    });
  });

  // Scenario: 100 elements (typical list)
  describe('100 elements', () => {
    bench('direct listeners', () => {
      const { container, cleanup } = createTestContainer();
      disableEventDelegation();
      const clicks = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <button key={i} onClick={() => clicks.set(clicks() + 1)}>
              Button {i}
            </button>
          ))}
        </div>
      );
      createIsland({ root: container, component: Component });
      flushScheduler();

      // Measure event dispatch
      const buttons = container.querySelectorAll('button');
      for (let i = 0; i < 10; i++) {
        fireEvent.click(buttons[i] as HTMLElement);
      }
      flushScheduler();
      enableEventDelegation();
      cleanup();
    });

    bench('delegated listeners', () => {
      const { container, cleanup } = createTestContainer();
      enableEventDelegation();
      const clicks = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <button key={i} onClick={() => clicks.set(clicks() + 1)}>
              Button {i}
            </button>
          ))}
        </div>
      );
      createIsland({ root: container, component: Component });
      flushScheduler();

      // Measure event dispatch
      const buttons = container.querySelectorAll('button');
      for (let i = 0; i < 10; i++) {
        fireEvent.click(buttons[i] as HTMLElement);
      }
      flushScheduler();
      cleanup();
    });
  });

  // Scenario: 1000 elements (large table/grid)
  describe('1000 elements', () => {
    bench('direct listeners', () => {
      const { container, cleanup } = createTestContainer();
      disableEventDelegation();
      const clicks = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 1000 }, (_, i) => (
            <button key={i} onClick={() => clicks.set(clicks() + 1)}>
              Button {i}
            </button>
          ))}
        </div>
      );
      createIsland({ root: container, component: Component });
      flushScheduler();

      // Measure event dispatch (sample)
      const buttons = container.querySelectorAll('button');
      for (let i = 0; i < 10; i++) {
        fireEvent.click(buttons[i * 100] as HTMLElement);
      }
      flushScheduler();
      enableEventDelegation();
      cleanup();
    });

    bench('delegated listeners', () => {
      const { container, cleanup } = createTestContainer();
      enableEventDelegation();
      const clicks = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 1000 }, (_, i) => (
            <button key={i} onClick={() => clicks.set(clicks() + 1)}>
              Button {i}
            </button>
          ))}
        </div>
      );
      createIsland({ root: container, component: Component });
      flushScheduler();

      // Measure event dispatch (sample)
      const buttons = container.querySelectorAll('button');
      for (let i = 0; i < 10; i++) {
        fireEvent.click(buttons[i * 100] as HTMLElement);
      }
      flushScheduler();
      cleanup();
    });
  });

  // Scenario: Multiple event types
  describe('multiple event types', () => {
    bench('direct listeners (3 event types)', () => {
      const { container, cleanup } = createTestContainer();
      disableEventDelegation();
      const events = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <button
              key={i}
              onClick={() => events.set(events() + 1)}
              onMouseOver={() => events.set(events() + 1)}
              onFocus={() => events.set(events() + 1)}
            >
              Button {i}
            </button>
          ))}
        </div>
      );
      createIsland({ root: container, component: Component });
      flushScheduler();

      const buttons = container.querySelectorAll('button');
      for (let i = 0; i < 10; i++) {
        fireEvent.click(buttons[i] as HTMLElement);
      }
      flushScheduler();
      enableEventDelegation();
      cleanup();
    });

    bench('delegated listeners (3 event types)', () => {
      const { container, cleanup } = createTestContainer();
      enableEventDelegation();
      const events = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <button
              key={i}
              onClick={() => events.set(events() + 1)}
              onMouseOver={() => events.set(events() + 1)}
              onFocus={() => events.set(events() + 1)}
            >
              Button {i}
            </button>
          ))}
        </div>
      );
      createIsland({ root: container, component: Component });
      flushScheduler();

      const buttons = container.querySelectorAll('button');
      for (let i = 0; i < 10; i++) {
        fireEvent.click(buttons[i] as HTMLElement);
      }
      flushScheduler();
      cleanup();
    });
  });
});
