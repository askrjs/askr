import { describe, it, expect } from 'vitest';
import { state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { registerMountOperation } from '../../src/runtime/component';
import type { JSXElement } from '../../src/jsx/types';
import { createIsland } from '../helpers/create-island';

describe('rollback listeners', () => {
  it('should preserve attached listeners when a render throws', () => {
    const { container, cleanup } = createTestContainer();

    let setThrow: ((v: boolean) => void) | null = null;
    let clicked = false;

    const Component = () => {
      const t = state(false);
      setThrow = (v: boolean) => t.set(v);

      registerMountOperation(() => {
        const btn = container.querySelector('#btn');
        if (btn) btn.addEventListener('click', () => (clicked = true));
      });

      if (t()) throw new Error('boom');

      return {
        type: 'div',
        children: [
          { type: 'button', props: { id: 'btn' }, children: ['click'] },
        ],
      } as unknown as JSXElement;
    };

    createIsland({ root: container, component: Component });

    const btn = container.querySelector('#btn') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toBe(true);

    clicked = false;
    expect(setThrow).not.toBeNull();
    setThrow!(true);
    expect(() => flushScheduler()).toThrow();

    const btnAfter = container.querySelector(
      '#btn'
    ) as HTMLButtonElement | null;
    expect(btnAfter).not.toBeNull();
    btnAfter!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toBe(true);

    cleanup();
  });
});
