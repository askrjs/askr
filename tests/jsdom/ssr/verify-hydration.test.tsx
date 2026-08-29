import { describe, it, expect } from 'vite-plus/test';
import { renderRouteRequestToString, renderToString } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import { createDataRuntime, createQuery, defineQuery } from '../../../src/data';
import { verifyHydrationSyncForUrl } from '../../../src/ssr/verify-hydration';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import {
  createRouteRegistry,
  currentAuth,
  Link,
  resolveRouteRequest,
  route,
} from '../../../src/router';

describe('verifyHydrationSyncForUrl', () => {
  it('should verify mounted route markup using the logical route path', () => {
    const { container, cleanup } = createTestContainer();

    try {
      const Component = () => (
        <main>
          Search <Link href="/results?q=pig#top">Results</Link>
        </main>
      );
      const registry = createRouteRegistry(() => route('/search', Component), {
        basePath: '/website',
      });
      const url = '/website/search/?q=pig#results';
      container.innerHTML = renderToString({ url, registry });

      expect(container.querySelector('a')?.getAttribute('href')).toBe(
        '/website/results?q=pig#top'
      );
      expect(
        verifyHydrationSyncForUrl({
          root: container,
          url,
          registry,
          resolved: { handler: Component, params: {} },
        })
      ).toBe(true);
      expect(() =>
        verifyHydrationSyncForUrl({
          root: container,
          url: '/search/?q=pig#results',
          registry,
          resolved: { handler: Component, params: {} },
        })
      ).toThrow('no route found');
    } finally {
      cleanup();
    }
  });

  it('should ignore multiline HTML comments when comparing markup', () => {
    const { container, cleanup } = createTestContainer();

    try {
      const Component = () => (
        <div>
          <span>ready</span>
        </div>
      );
      const routes = [{ path: '/', handler: Component }];
      const registry = routeRegistryFromTable(routes);
      const html = renderToString({ url: '/', registry });

      container.innerHTML = html.replace(
        '<span>',
        '<!-- hydration\nmarker --><span>'
      );

      expect(
        verifyHydrationSyncForUrl({
          root: container,
          url: '/',
          registry,
          resolved: {
            handler: Component,
            params: {},
          },
        })
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('should ignore the request-local SSR style carrier when comparing app markup', () => {
    const { container, cleanup } = createTestContainer();

    try {
      const Component = () => <main>{'ready'}</main>;
      const registry = routeRegistryFromTable([
        { path: '/', handler: Component },
      ]);
      container.innerHTML =
        '<style data-askr-style-registry="true">.ready{display:block}</style>' +
        renderToString({ url: '/', registry });

      expect(
        verifyHydrationSyncForUrl({
          root: container,
          url: '/',
          registry,
          resolved: { handler: Component, params: {} },
        })
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('should verify with the auth context attached to the resolved route', async () => {
    const { container, cleanup } = createTestContainer();

    try {
      const registry = createRouteRegistry(
        () => route('/', () => <main>{currentAuth().principal?.id}</main>),
        {
          auth: {
            resolve: () => ({
              authenticated: true,
              principal: { id: 'route-a' },
              session: null,
              tenant: null,
            }),
          },
        }
      );
      const rendered = await renderRouteRequestToString({ url: '/', registry });
      if (rendered.kind !== 'render') throw new Error('expected render');
      container.innerHTML = rendered.html;
      const resolved = await resolveRouteRequest('/', {
        registry,
        mode: 'spa',
        load: false,
      });
      if (!resolved || resolved.kind !== 'render') {
        throw new Error('expected resolved route');
      }

      const otherRegistry = createRouteRegistry(
        () => route('/', () => <main>{'other'}</main>),
        {
          auth: {
            resolve: () => ({
              authenticated: true,
              principal: { id: 'route-b' },
              session: null,
              tenant: null,
            }),
          },
        }
      );
      await resolveRouteRequest('/', {
        registry: otherRegistry,
        mode: 'spa',
        load: false,
      });

      expect(currentAuth().principal?.id).toBe('route-b');
      expect(
        verifyHydrationSyncForUrl({
          root: container,
          url: '/',
          registry,
          resolved,
        })
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('should verify query-backed markup against the hydrated data runtime', () => {
    const { container, cleanup } = createTestContainer();

    try {
      const greetingQuery = defineQuery<
        Record<string, never>,
        { message: string }
      >({
        key: () => 'greeting',
        fetch: async () => ({ message: 'loaded later' }),
      });
      const Component = () => {
        const greeting = createQuery(greetingQuery, {});
        return <p>{greeting.data?.message ?? 'loading'}</p>;
      };
      const routes = [{ path: '/', handler: Component }];
      const registry = routeRegistryFromTable(routes);
      const dataRuntime = createDataRuntime();
      dataRuntime.queryData.set('greeting', { message: 'ready' });
      container.innerHTML = renderToString({
        url: '/',
        registry,
        dataRuntime,
      });

      expect(
        verifyHydrationSyncForUrl({
          root: container,
          url: '/',
          registry,
          resolved: { handler: Component, params: {} },
          options: { dataRuntime },
        })
      ).toBe(true);
    } finally {
      cleanup();
    }
  });
});
