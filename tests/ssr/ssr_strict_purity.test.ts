import { describe, it, expect } from 'vitest';
import type { JSXElement } from '../../src/jsx/types';
import { renderToStringSync } from '../../src/ssr';

describe('SSR strict purity', () => {
  it('should throw in dev when component uses global time/randomness during SSR', () => {
    const Component = () => {
      // This uses Date and Math inside render
      const t = Date.now();
      const r = Math.random();
      return { type: 'div', children: [String(t), String(r)] } as JSXElement;
    };

    // Desired public invariant: SSR should be strict about pure rendering and
    // should throw when user components access global time/randomness.
    expect(() => renderToStringSync(() => Component())).toThrow();
  });
});
