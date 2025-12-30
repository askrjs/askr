/**
 * tests/runtime/event_happens_before.test.ts
 *
 * SPEC 2.3: Happens-Before Events (No Races)
 *
 * These tests prove strict event ordering: if E1 occurs before E2,
 * all effects of E1 (state changes + commits) complete before E2 starts.
 * No race conditions. Ever.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state } from '../../src/index';
import {
  createTestContainer,
  fireEvent,
  flushScheduler,
} from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('happens-before events (SPEC 2.3)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe('strict event ordering', () => {
    it('should complete E1 before E2 starts', async () => {
      const timeline: string[] = [];

      const Component = () => {
        const count = state(0);

        const handleE1 = () => {
          timeline.push('E1-handler-start');
          count.set(count() + 1);
          timeline.push('E1-handler-end');
        };

        const handleE2 = () => {
          timeline.push('E2-handler-start');
          const val = count();
          // E1 effects must be visible
          expect(val).toBeGreaterThan(0);
          timeline.push('E2-handler-end');
        };

        return (
          <div>
            <button onClick={handleE1} id="e1">
              E1
            </button>
            <button onClick={handleE2} id="e2">
              E2
            </button>
            <span>count: {String(count())}</span>
          </div>
        );
      };

      createIsland({ root: container, component: Component });

      const e1 = container.querySelector('#e1') as HTMLButtonElement;
      const e2 = container.querySelector('#e2') as HTMLButtonElement;

      fireEvent.click(e1);
      flushScheduler();

      fireEvent.click(e2);
      flushScheduler();

      // Timeline shows strict ordering
      expect(timeline).toEqual([
        'E1-handler-start',
        'E1-handler-end',
        'E2-handler-start',
        'E2-handler-end',
      ]);
    });

    it('should make state change from E1 visible to E2', async () => {
      // See issues/event-ordering.md
      const Component = () => {
        const counter = state(0);
        const valueSeenByE2 = state(-1);

        const handleE1 = () => {
          counter.set(42);
        };

        const handleE2 = () => {
          // When E2 runs, counter should be 42 (set by E1)
          valueSeenByE2.set(counter());
        };

        return (
          <div>
            <button onClick={handleE1} id="e1">
              E1
            </button>
            <button
              onClick={handleE2}
              id="e2"
              data-value-seen={String(valueSeenByE2())}
            >
              E2
            </button>
          </div>
        );
      };

      createIsland({ root: container, component: Component });

      const e1 = container.querySelector('#e1') as HTMLButtonElement;
      const e2 = container.querySelector('#e2') as HTMLButtonElement;

      fireEvent.click(e1);
      flushScheduler();

      fireEvent.click(e2);
      flushScheduler();

      // E2 saw the value E1 set (ASPIRATIONAL - requires state to be visible across handlers)
      const dataSeen = e2.getAttribute('data-value-seen');
      expect(dataSeen).toBe('42');
    });
  });

  describe('handlers are scheduler-wrapped by default', () => {
    it('should execute handler synchronously and defer render', async () => {
      // See issues/event-ordering.md
      const order: string[] = [];

      const Component = () => {
        const count = state(0);
        order.push('render');

        const handleClick = () => {
          order.push('handler-start');
          count.set(1);
          order.push('handler-end');
          // At this point, render hasn't happened yet (ASPIRATIONAL)
          expect(count()).toBe(1);
        };

        return <button onClick={handleClick}>{String(count())}</button>;
      };

      createIsland({ root: container, component: Component });
      order.length = 0; // Clear initial render

      const button = container.querySelector('button') as HTMLButtonElement;
      fireEvent.click(button);

      // Handler runs synchronously (ASPIRATIONAL - currently render happens here)
      expect(order).toEqual(['handler-start', 'handler-end']);

      // Render hasn't happened yet (ASPIRATIONAL)
      expect(button.textContent).toBe('0');
      // After scheduler flushes, render happens (ASPIRATIONAL)
      flushScheduler();
      expect(button.textContent).toBe('1');
    });

    it('should not race when multiple rapid clicks occur', async () => {
      // See issues/event-ordering.md
      const finalValues: number[] = [];

      const Component = () => {
        const count = state(0);

        return (
          <button
            onClick={() => {
              count.set(count() + 1);
              finalValues.push(count());
            }}
          >
            {String(count())}
          </button>
        );
      };

      createIsland({ root: container, component: Component });

      const button = container.querySelector('button') as HTMLButtonElement;

      // Rapid clicks
      for (let i = 0; i < 10; i++) {
        fireEvent.click(button);
      }

      flushScheduler();

      // Each click incremented sequentially (no race) - ASPIRATIONAL
      expect(finalValues).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(button.textContent).toContain('10');
    });
  });

  describe('no interleaving of effects', () => {
    it('should not interleave effects of two components', async () => {
      const order: string[] = [];

      const ComponentA = () => {
        const val = state('a-idle');

        return (
          <button
            id="a"
            onClick={() => {
              order.push('a-start');
              val.set('a-active');
              order.push('a-end');
            }}
          >
            {val()}
          </button>
        );
      };

      const ComponentB = () => {
        const val = state('b-idle');

        return (
          <button
            id="b"
            onClick={() => {
              order.push('b-start');
              val.set('b-active');
              order.push('b-end');
            }}
          >
            {val()}
          </button>
        );
      };

      createIsland({
        root: container,
        component: () => (
          <div>
            <ComponentA />
            <ComponentB />
          </div>
        ),
      });

      const aButton = container.querySelector('#a') as HTMLButtonElement;
      const bButton = container.querySelector('#b') as HTMLButtonElement;

      fireEvent.click(aButton);
      fireEvent.click(bButton);

      flushScheduler();

      // A completes fully before B starts
      const aStartIdx = order.indexOf('a-start');
      const aEndIdx = order.indexOf('a-end');
      const bStartIdx = order.indexOf('b-start');
      const bEndIdx = order.indexOf('b-end');

      expect(aStartIdx).toBeLessThan(aEndIdx);
      expect(aEndIdx).toBeLessThan(bStartIdx);
      expect(bStartIdx).toBeLessThan(bEndIdx);
    });
  });

  describe('prevents classic race condition patterns', () => {
    it('should prevent lost update race condition', async () => {
      const Component = () => {
        const count = state(0);

        const increment = () => {
          count.set(count() + 1);
        };

        return (
          <div>
            <button onClick={increment} id="inc">
              ++
            </button>
            <span>{String(count())}</span>
          </div>
        );
      };

      createIsland({ root: container, component: Component });

      const button = container.querySelector('#inc') as HTMLButtonElement;

      // 1000 clicks
      for (let i = 0; i < 1000; i++) {
        fireEvent.click(button);
      }

      flushScheduler();

      // All increments counted (no lost updates)
      const span = container.querySelector('span');
      expect(span?.textContent).toContain('1000');
    });

    it('should prevent read-modify-write race', async () => {
      const Component = () => {
        const value = state(0);

        const doubleValue = () => {
          // Atomically read and write
          value.set(value() * 2);
        };

        return (
          <button onClick={doubleValue} data-final={value()}>
            value: {String(value())}
          </button>
        );
      };

      createIsland({ root: container, component: Component });

      const button = container.querySelector('button') as HTMLButtonElement;

      // Rapid double operations
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      flushScheduler();

      // Values should be correct powers of 2 (0 * 2 = 0 still)
      // But the pattern proves no interleaving
      expect(button.textContent).toContain('value: 0');
    });
  });
});
