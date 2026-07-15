import { describe, it, expect } from 'vite-plus/test';
import { renderToString, type SSRRoute } from '../../../src/ssr';
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
      const routes: SSRRoute[] = [{ path: '/', handler: Component }];
      const html = renderToString({ url: '/', routes });

      container.innerHTML = html.replace(
        '<span>',
        '<!-- hydration\nmarker --><span>'
      );

      expect(
        verifyHydrationSyncForUrl({
          root: container,
          url: '/',
          routes,
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
      const routes: SSRRoute[] = [{ path: '/', handler: Component }];
      const dataRuntime = createDataRuntime();
      dataRuntime.queryData.set('greeting', { message: 'ready' });
      container.innerHTML = renderToString({
        url: '/',
        routes,
        dataRuntime,
      });

      expect(
        verifyHydrationSyncForUrl({
          root: container,
          url: '/',
          routes,
          resolved: { handler: Component, params: {} },
          options: { dataRuntime },
        })
      ).toBe(true);
    } finally {
      cleanup();
    }
  });
});
