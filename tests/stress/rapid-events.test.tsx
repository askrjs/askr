/**
 * tests/stress/rapid_events.test.ts
 *
 * Stress test: Framework handles high-frequency events correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state, createIslands } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

type Island = Parameters<typeof createIslands>[0]['islands'][number];
const createIsland = (island: Island) => createIslands({ islands: [island] });

describe('rapid events (STRESS)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should display correct count when button is clicked 1000 times', async () => {
    const Component = () => {
      const count = state(0);

      return {
        type: 'button',
        props: { onClick: () => count.set(count() + 1) },
        children: [`${count()}`],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const button = container.querySelector('button') as HTMLButtonElement;

    for (let i = 0; i < 1000; i++) {
      button?.click();
    }
    flushScheduler();

    expect(button.textContent).toContain('1000');
  });

  it('should serialize event handlers correctly when multiple clicks occur', async () => {
    const values: number[] = [];
    const Component = () => {
      const count = state(0);

      return {
        type: 'button',
        props: {
          onClick: () => {
            count.set(count() + 1);
            values.push(count());
          },
        },
        children: [`${count()}`],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const button = container.querySelector('button') as HTMLButtonElement;

    // Fire 100 clicks
    for (let i = 0; i < 100; i++) {
      button?.click();
    }
    flushScheduler();

    // Should see monotonically increasing values
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i + 1]);
    }
  });
});
