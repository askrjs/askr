import { describe, it, expect } from 'vitest';
import { createApp, state, scheduleEventHandler } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('scheduler event wrapper semantics', () => {
  it('should run handler synchronously and defer flush', () => {
    const order: string[] = [];

    const Component = () => {
      const count = state(0);
      const wrapped = scheduleEventHandler(() => {
        order.push('handler-start');
        count.set(count() + 1);
        order.push('handler-end');
      });

      return {
        type: 'button',
        props: { id: 'btn', onClick: wrapped },
        children: [String(count())],
      };
    };

    const { container, cleanup } = createTestContainer();
    try {
      createApp({ root: container, component: Component });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      order.length = 0;

      // Click the button - handler runs synchronously
      btn.click();

      // Effects should be visible immediately but render is deferred
      expect(order).toEqual(['handler-start', 'handler-end']);
      expect(btn.textContent).toBe('0');

      // After flush, render completes
      flushScheduler();
      expect(btn.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });
});
