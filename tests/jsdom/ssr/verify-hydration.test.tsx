import { describe, it, expect } from 'vite-plus/test';
import { renderToString, type SSRRoute } from '../../../src/ssr';
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
        })
      ).toBe(true);
    } finally {
      cleanup();
    }
  });
});
