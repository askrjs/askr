import { describe, it, expect } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import { resource } from '../../../src/resources';
import type { JSXElement } from '../../../src/jsx/types';

describe('SSR resource() with preloaded data', () => {
  it('should render a preloaded resource value without throwing', () => {
    function App(): JSXElement {
      const r = resource<string>(() => 'unused-loader', []);
      return <div>{r.value ?? 'loading'}</div>;
    }

    const html = renderToStringSync(
      App as unknown as () => JSXElement,
      undefined,
      {
        data: { 'r:0': 'preloaded-value' },
      }
    );

    expect(html).toContain('preloaded-value');
  });

  it('should render multiple preloaded resources with keyed data', () => {
    function App(): JSXElement {
      const first = resource<string>(() => 'unused-a', []);
      const second = resource<string>(() => 'unused-b', []);
      return (
        <div>
          {first.value ?? 'loading-a'}-{second.value ?? 'loading-b'}
        </div>
      );
    }

    const html = renderToStringSync(
      App as unknown as () => JSXElement,
      undefined,
      {
        data: { 'r:0': 'alpha', 'r:1': 'beta' },
      }
    );

    expect(html).toContain('alpha-beta');
  });

  it('should update snapshot in place when preloaded data changes across SSR renders', () => {
    function App(): JSXElement {
      const r = resource<string>(() => 'unused-loader', []);
      return <div>{r.value ?? 'loading'}</div>;
    }

    const first = renderToStringSync(
      App as unknown as () => JSXElement,
      undefined,
      {
        data: { 'r:0': 'first-value' },
      }
    );
    const second = renderToStringSync(
      App as unknown as () => JSXElement,
      undefined,
      {
        data: { 'r:0': 'second-value' },
      }
    );

    expect(first).toContain('first-value');
    expect(second).toContain('second-value');
  });
});
