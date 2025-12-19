import { describe, it, expect } from 'vitest';
import { renderToStringSync } from '../../src/ssr';
import { resource } from '../../src/index';
import type { JSXElement } from '../../src/jsx/types';

describe('SSR resource behavior', () => {
  it('should throw when resource fn is async during synchronous SSR', () => {
    function App(): JSXElement {
      // illegal: async resource during SSR
      // fn returns a promise -> should throw during SSR
      // @ts-expect-error - testing runtime behavior
      resource(() => Promise.resolve('x'), []);
      return { type: 'div', props: { children: ['ok'] } };
    }

    expect(() =>
      renderToStringSync(App as unknown as () => JSXElement)
    ).toThrow();
  });
});
