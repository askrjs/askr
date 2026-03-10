import { bench, describe, expect } from 'vitest';
import { renderToStringSyncForUrl } from '../src/ssr';
import {
  buildSsrLayoutRouteFixture,
  tier2BenchOptions,
} from './_shared';

const fixture = buildSsrLayoutRouteFixture();
const html = renderToStringSyncForUrl({
  url: fixture.url,
  routes: fixture.routes,
});

expect(html).toContain(fixture.shellMarker);
expect(html).toContain(fixture.expectedMarker);

describe('tier2 ssr layout route', () => {
  bench(
    'render a nested layout route with params query and hash',
    () => {
      renderToStringSyncForUrl({
        url: fixture.url,
        routes: fixture.routes,
      });
    },
    tier2BenchOptions
  );
});
