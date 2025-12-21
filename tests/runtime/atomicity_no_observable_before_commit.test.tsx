import { describe, it, expect } from 'vitest';
import type { JSXElement } from '../../src/jsx/types';
import { createTestContainer } from '../helpers/test_renderer';
import { createIsland, timer } from '../../src/index';

describe('Atomicity: no observable work before commit', () => {
  it('should not attach listeners or start timers when render fails', () => {
    const { container, cleanup } = createTestContainer();

    try {
      let clicked = false;
      let timerFired = false;

      const Good = () => {
        // schedule a mount-timer via public API that would start only on commit
        timer(0, () => {
          timerFired = true;
        });

        return {
          type: 'button',
          props: { id: 'btn', onClick: () => (clicked = true) },
          children: ['Click'],
        } as JSXElement;
      };

      const Crash = () => {
        throw new Error('boom during render');
      };

      const Parent = () =>
        ({ type: 'div', children: [Good(), Crash()] }) as JSXElement;

      // Mount should throw
      expect(() =>
        createIsland({ root: container, component: Parent })
      ).toThrow();

      // No DOM should have been committed
      expect(container.querySelector('#btn')).toBeNull();

      // No timer should have fired
      expect(timerFired).toBe(false);

      // And clicking would not change anything even if element somehow existed
      clicked = false;
      const btn = container.querySelector('#btn') as HTMLButtonElement | null;
      if (btn) btn.click();
      expect(clicked).toBe(false);
    } finally {
      cleanup();
    }
  });
});
