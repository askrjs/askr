import { describe, expect, it } from 'vite-plus/test';
import { Link } from '../../../src/components/link';
import { currentRoute } from '../../../src/router/activity';
import {
  createRouteRegistry,
  fallback,
  route,
} from '../../../src/router/route';
import { renderRouteRequestToString, renderToString } from '../../../src/ssr';

describe('SSR route base paths', () => {
  it('should match a mounted request and render physical links with logical route state', async () => {
    const registry = createRouteRegistry(
      () => {
        route('/reviews/{slug}', () => {
          const snapshot = currentRoute<{ slug: string }>();
          return (
            <main data-path={snapshot.path} data-slug={snapshot.params.slug}>
              <Link href="/about">About</Link>
            </main>
          );
        });
      },
      { basePath: '/website' }
    );

    const result = await renderRouteRequestToString({
      url: '/website/reviews/the-zoo-box/?preview=1',
      registry,
    });
    if (result.kind !== 'render') throw new Error('expected render');

    expect(result.html).toContain('data-path="/reviews/the-zoo-box/"');
    expect(result.html).toContain('data-slug="the-zoo-box"');
    expect(result.html).toContain('href="/website/about"');
  });

  it('should keep scoped matching strict and apply fallbacks below the mount', async () => {
    const registry = createRouteRegistry(
      () => {
        route('/', () => <p>home</p>);
        fallback(() => <p>mounted fallback</p>);
      },
      { basePath: '/website/' }
    );

    const fallbackResult = await renderRouteRequestToString({
      url: '/website/missing/path',
      registry,
    });
    expect(fallbackResult.kind).toBe('render');
    if (fallbackResult.kind === 'render') {
      expect(fallbackResult.html).toContain('mounted fallback');
    }
    await expect(
      renderRouteRequestToString({ url: '/outside', registry })
    ).resolves.toMatchObject({ kind: 'no-match' });
  });

  it('should support the synchronous SSR renderer at its physical URL', () => {
    const registry = createRouteRegistry(
      () => route('/about', () => <Link href="/">Home</Link>),
      { basePath: '/website' }
    );

    expect(renderToString({ url: '/website/about', registry })).toContain(
      'href="/website/"'
    );
  });
});
