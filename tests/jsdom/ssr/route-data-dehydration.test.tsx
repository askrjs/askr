import { describe, expect, it, vi } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, route } from '../../../src/router/route';
import { routeData } from '../../../src/router/deferred';
import { renderRouteRequestToString } from '../../../src/ssr';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

function hydrationPayload(html: string): string {
  const match = html.match(
    /<script type="application\/json" data-askr-render-data="true">([\s\S]*?)<\/script>/
  );
  if (!match) throw new Error('missing hydration payload');
  return match[1];
}

describe('route data dehydration', () => {
  it('should render with complete data and serialize only the selected subset', async () => {
    const registry = createRouteRegistry(() => {
      route(
        '/posts/{slug}',
        () => {
          const data = routeData<{
            title: string;
            renderServerOnly: () => string;
          }>();
          return <article>{data.renderServerOnly()}</article>;
        },
        {
          loader: ({ params }) => ({
            title: params.slug,
            renderServerOnly: () => `server:${params.slug}`,
          }),
          dehydrate: (data, context) => ({
            title: `${data.title}:${context.params.slug}`,
          }),
        }
      );
    });

    const result = await renderRouteRequestToString({
      url: '/posts/hello',
      registry,
    });
    if (result.kind !== 'render') throw new Error('expected render');

    expect(result.html).toContain('<article>server:hello</article>');
    const payload = hydrationPayload(result.html);
    const parsed = JSON.parse(payload) as {
      route: Record<string, unknown>;
      framework: Record<string, unknown>;
    };
    expect(parsed.route).toEqual({ title: 'hello:hello' });
    expect(parsed.route).not.toHaveProperty('renderServerOnly');
    expect(payload).toContain('"rh":{"r":"/posts/hello"');
  });

  it('should fail before returning HTML when identity hydration data is invalid', async () => {
    const registry = createRouteRegistry(() => {
      route('/broken', () => <p>must not publish</p>, {
        loader: () => ({ nested: { callback: () => null } }),
      });
    });

    await expect(
      renderRouteRequestToString({ url: '/broken', registry })
    ).rejects.toThrow(/\/broken.*\$\.nested\.callback.*functions/);
  });

  it('should throw on an omitted initial read with an actionable diagnostic', async () => {
    const { container, cleanup } = createTestContainer();
    const registry = createRouteRegistry(() => {
      route(
        '/private',
        () => {
          const data = routeData<{ secret: string }>();
          return <p>{data.secret}</p>;
        },
        {
          loader: () => ({ secret: 'server-only' }),
          dehydrate: () => ({}),
        }
      );
    });

    try {
      window.history.replaceState({}, '', '/private');
      const result = await renderRouteRequestToString({
        url: '/private',
        registry,
      });
      if (result.kind !== 'render') throw new Error('expected render');
      container.innerHTML = result.html;

      await expect(
        hydrateSPA({
          root: container,
          registry,
          hydrate: { verifyMarkup: false },
        })
      ).rejects.toThrow(
        /routeData\(\).*\$\.secret.*initial hydration.*client navigation/
      );
    } finally {
      cleanup();
    }
  });

  it('should hydrate the selected subset and expose complete data after navigation', async () => {
    const { container, cleanup } = createTestContainer();
    let initialLoads = 0;
    let navigationLoads = 0;
    const registry = createRouteRegistry(() => {
      route(
        '/initial',
        () => {
          const data = routeData<{ visible: string }>();
          return <p id="visible">{data.visible}</p>;
        },
        {
          loader: () => {
            initialLoads += 1;
            return {
              visible: 'hydrated',
              secret: 'omitted',
              legacy: 'also omitted',
            };
          },
          dehydrate: (data) => ({ visible: data.visible }),
        }
      );
      route(
        '/complete',
        () => {
          const data = routeData<{ secret: string; legacy?: string }>();
          return (
            <p id="secret">
              {`${data.secret}:${data.legacy ?? 'naturally absent'}`}
            </p>
          );
        },
        {
          loader: () => {
            navigationLoads += 1;
            return { visible: 'client', secret: 'complete loader result' };
          },
          dehydrate: (data) => ({ visible: data.visible }),
        }
      );
    });

    try {
      window.history.replaceState({}, '', '/initial');
      const result = await renderRouteRequestToString({
        url: '/initial',
        registry,
      });
      if (result.kind !== 'render') throw new Error('expected render');
      container.innerHTML = result.html;

      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: false },
      });
      expect(container.querySelector('#visible')?.textContent).toBe('hydrated');
      expect(initialLoads).toBe(1);

      navigate('/complete');
      await vi.waitFor(() =>
        expect(container.querySelector('#secret')?.textContent).toBe(
          'complete loader result:naturally absent'
        )
      );
      expect(navigationLoads).toBe(1);
    } finally {
      cleanup();
    }
  });
});
