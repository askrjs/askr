import { describe, it, expect } from 'vite-plus/test';
import { renderToString } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import { createDataRuntime, createQuery, defineQuery } from '../../../src/data';
import { verifyHydrationSyncForUrl } from '../../../src/ssr/verify-hydration';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

describe('verifyHydrationSyncForUrl', () => {
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
