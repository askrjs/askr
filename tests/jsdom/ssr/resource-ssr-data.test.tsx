import { describe, it, expect, vi } from 'vite-plus/test';
import {
  renderToString,
  renderToStringSync,
  SSRDataMissingError,
} from '../../../src/ssr';
import { resource } from '../../../src/resources';
import { createRouteRegistry, route } from '../../../src/router';
import type { JSXElement } from '../../../src/jsx/types';

function UsesSyncResource(): JSXElement {
  const result = resource<string>(() => 'loaded', []);
  return <main>{result.value ?? 'loading'}</main>;
}

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

  it('should render route-based SSR with a synchronous resource when no render data is provided', () => {
    const routes = [{ path: '/', handler: UsesSyncResource }];

    expect(renderToString({ url: '/', routes })).toBe('<main>loaded</main>');
  });

  it('should throw when route-based SSR is given an explicit empty render-data object', () => {
    const routes = [{ path: '/', handler: UsesSyncResource }];

    expect(() => renderToString({ url: '/', routes, data: {} })).toThrowError(
      SSRDataMissingError
    );
  });

  it('should render URL-based registry SSR with preloaded resource data deterministically', () => {
    const nameLoader = vi.fn((_opts: { signal: AbortSignal }) => 'loader-name');
    const tabLoader = vi.fn((_opts: { signal: AbortSignal }) => 'loader-tab');
    const registry = createRouteRegistry(() => {
      route('/users/{id}', ({ id }) => {
        const name = resource<string>(nameLoader, [id]);
        const tab = resource<string>(tabLoader, []);

        return (
          <main>
            {id}:{name.value}:{tab.value}
          </main>
        );
      });
    });

    const html = renderToString({
      url: '/users/42?tab=profile',
      registry,
      data: { 'r:0': 'Ada', 'r:1': 'profile' },
    });

    expect(html).toBe(
      '<main>42:Ada:profile</main><script type="application/json" data-askr-render-data="true">{"r:0":"Ada","r:1":"profile"}</script>'
    );
    expect(nameLoader).not.toHaveBeenCalled();
    expect(tabLoader).not.toHaveBeenCalled();
  });

  it('should throw before invoking resource loaders when URL-based SSR data is incomplete', () => {
    const nameLoader = vi.fn((_opts: { signal: AbortSignal }) => 'loader-name');
    const tabLoader = vi.fn((_opts: { signal: AbortSignal }) => 'loader-tab');
    const registry = createRouteRegistry(() => {
      route('/users/{id}', ({ id }) => {
        const name = resource<string>(nameLoader, [id]);
        const tab = resource<string>(tabLoader, []);

        return (
          <main>
            {id}:{name.value}:{tab.value}
          </main>
        );
      });
    });

    expect(() =>
      renderToString({
        url: '/users/42?tab=profile',
        registry,
        data: { 'r:0': 'Ada' },
      })
    ).toThrowError(SSRDataMissingError);
    expect(nameLoader).not.toHaveBeenCalled();
    expect(tabLoader).not.toHaveBeenCalled();
  });
});
