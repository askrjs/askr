import { describe, it, expect } from 'vitest';
import type { JSXElement } from '../../src/jsx/types';
import { renderToStringSync, hydrate } from '../../src/ssr';
import { createTestContainer } from '../helpers/test_renderer';

describe('Hydration: non-observing', () => {
  it('should not invoke handlers or subscriptions during hydration', async () => {
    const { container, cleanup } = createTestContainer();
    try {
      let clicks = 0;

      const Component = () =>
        ({
          type: 'div',
          props: { id: 'root' },
          children: [
            {
              type: 'button',
              props: { id: 'btn', onClick: () => (clicks += 1) },
              children: ['Click'],
            },
          ],
        }) as JSXElement;

      // Server render
      const html = renderToStringSync(() => Component());
      container.innerHTML = html;

      // Hydrate — should NOT cause any handler to fire as a side-effect
      await hydrate(`#${container.id}`, () => Component());

      // No handler should have fired during hydrate
      expect(clicks).toBe(0);

      // After hydration a click should work
      const btn = container.querySelector('#btn') as HTMLButtonElement;
      btn.click();
      expect(clicks).toBe(1);
    } finally {
      cleanup();
    }
  });
});
