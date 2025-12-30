import { describe, it, expect } from 'vitest';
import { renderToStringSync, SSRDataMissingError } from '../../src/ssr';
import { resource as runtimeResource } from '../../src/runtime/operations';
import { resource } from '../../src/resources';
import type { JSXElement } from '../../src/jsx/types';

describe('SSR resource behavior', () => {
  it('should throw SSRDataMissingError when resource() is called during SSR', () => {
    const Comp = () => {
      runtimeResource(async () => 'x');
      return <div>x</div>;
    };

    expect(() => renderToStringSync(Comp)).toThrowError(SSRDataMissingError);
    expect(() => renderToStringSync(Comp)).toThrow(
      /Server-side rendering requires all data to be available synchronously\. This component attempted to use async data during SSR\./
    );
  });

  it('should throw when resource fn is async during synchronous SSR', () => {
    function App(): JSXElement {
      // illegal: async resource during SSR
      // fn returns a promise -> should throw during SSR
      resource(() => Promise.resolve('x'), []);
      return <div>ok</div>;
    }

    expect(() =>
      renderToStringSync(App as unknown as () => JSXElement)
    ).toThrowError(SSRDataMissingError);
    expect(() =>
      renderToStringSync(App as unknown as () => JSXElement)
    ).toThrow(
      /Server-side rendering requires all data to be available synchronously\. This component attempted to use async data during SSR\./
    );
  });
});

// SSR prepass/collection tests removed — SSR is strictly synchronous and prepass collection is not supported.
