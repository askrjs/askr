import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToStringSync, hydrate } from '../../src/ssr';
import { createTestContainer } from '../helpers/test_renderer';

describe('SSR hydration (roundtrip)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should produce identical output and attach listeners when using renderToStringSync and hydrate', async () => {
    let clicks = 0;
    let _renderCount = 0;

    const Component = () => {
      _renderCount++;
      return {
        type: 'div',
        props: { id: 'root' },
        children: [
          {
            type: 'button',
            props: { id: 'btn', onClick: () => (clicks += 1) },
            children: ['Click'],
          },
        ],
      };
    };

    // Server render
    const html = renderToStringSync(() => Component());
    container.innerHTML = html;

    // Hydrate — should not throw and should not modify DOM
    await hydrate(`#${container.id}`, () => Component());

    // DOM unchanged
    expect(container.innerHTML).toBe(html);

    // Click should invoke handler
    const btn = container.querySelector('#btn') as HTMLButtonElement;
    btn.click();
    expect(clicks).toBe(1);

    // Render count may have increased by client-side initialization, but DOM unchanged
    expect(container.querySelector('#btn')).not.toBeNull();
  });

  it('should throw when hydrate encounters a mismatch', async () => {
    const Component = () => ({
      type: 'div',
      props: { id: 'root' },
      children: ['server'],
    });
    container.innerHTML = '<div>client</div>';

    await expect(
      hydrate(`#${container.id}`, () => Component())
    ).rejects.toThrow();
  });
});
