import { describe, it, expect } from 'vitest';
import { createIsland, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { registerMountOperation } from '../../src/runtime/component';
import type { JSXElement } from '../../src/jsx/types';

describe('rollback behavior', () => {
  it('should preserve existing DOM and listeners when a render throws', () => {
    const { container, cleanup } = createTestContainer();

    let setThrow: ((v: boolean) => void) | null = null;
    let clicked = false;

    const Component = () => {
      // setup local state and expose setter to the test via closure
      const t = state(false);
      setThrow = (v: boolean) => t.set(v);

      // Add a mount operation that attaches a real DOM listener to the button
      // so we can check it survives a failed render attempt.
      registerMountOperation(() => {
        const btn = container.querySelector('#btn');
        if (btn) {
          btn.addEventListener('click', () => {
            clicked = true;
          });
        }
      });

      if (t()) {
        throw new Error('render failed intentionally');
      }

      return {
        type: 'div',
        children: [
          {
            type: 'button',
            props: { id: 'btn' },
            children: ['click'],
          },
        ],
      } as unknown as JSXElement;
    };

    createIsland({ root: container, component: Component });

    const btn = container.querySelector('#btn') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();

    // Ensure listener works before breaking render
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toBe(true);

    clicked = false;

    // Trigger failing render
    setThrow?.(true);
    // Flush scheduler; commit should attempt and fail
    expect(() => flushScheduler()).toThrow();

    // DOM should be unchanged and listener should still work
    const btnAfter = container.querySelector(
      '#btn'
    ) as HTMLButtonElement | null;
    expect(btnAfter).not.toBeNull();
    btnAfter!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toBe(true);

    cleanup();
  });
});
