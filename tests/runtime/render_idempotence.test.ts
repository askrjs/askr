import { describe, it, expect } from 'vitest';
import type { JSXElement } from '../../src/jsx/types';
import { renderToStringSync } from '../../src/ssr';

describe('Render idempotence', () => {
  it('should produce identical output and leave no residual global state when rendering the same tree twice', () => {
    const Component = () =>
      ({
        type: 'div',
        props: { class: 'x' },
        children: ['a'],
      }) as unknown as JSXElement;

    const originalRandom = Math.random;
    const originalDateNow = Date.now;

    const a = renderToStringSync(() => Component());
    const b = renderToStringSync(() => Component());

    // Deterministic SSR should produce identical strings across calls
    expect(a).toBe(b);

    // SSR should not leak global changes (Math.random / Date.now should be restored)
    expect(Math.random).toBe(originalRandom);
    expect(Date.now).toBe(originalDateNow);
  });
});
