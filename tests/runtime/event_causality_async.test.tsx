import { describe, it, expect } from 'vitest';
import type { JSXElement } from '../../src/jsx/types';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';
import { createApp, state, capture } from '../../src/index';

describe('Event causality across async boundaries', () => {
  it('should observe state at scheduling time given events scheduled by async continuations', async () => {
    const { container, cleanup } = createTestContainer();
    try {
      const observed: number[] = [];

      const Component = () => {
        const count = state(0);

        return {
          type: 'div',
          props: {},
          children: [
            {
              type: 'button',
              props: {
                id: 'observe',
                onClick: () => {
                  // Capture the current value explicitly and schedule a continuation
                  const snap = capture(() => count());
                  Promise.resolve().then(() => {
                    observed.push(snap());
                  });
                },
              },
              children: ['observe'],
            },
            {
              type: 'button',
              props: {
                id: 'inc',
                onClick: () => {
                  count.set(count() + 1);
                },
              },
              children: ['inc'],
            },
          ],
        } as JSXElement;
      };

      createApp({ root: container, component: Component });
      flushScheduler();

      const observeBtn = container.querySelector(
        '#observe'
      ) as HTMLButtonElement;
      const incBtn = container.querySelector('#inc') as HTMLButtonElement;

      // Click observe (schedules microtask that will read count)
      observeBtn.click();

      // Immediately increment state before microtask resolves
      incBtn.click();
      flushScheduler();

      // Wait for microtasks to resolve
      await Promise.resolve();

      // The observed value should be the original value at schedule time (0), not the later mutated value (1)
      expect(observed.length).toBeGreaterThan(0);
      expect(observed[0]).toBe(0);
    } finally {
      cleanup();
    }
  });
});
