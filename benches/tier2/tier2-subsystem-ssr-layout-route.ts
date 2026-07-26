import { bench, describe, expect } from 'vite-plus/test';
import { renderToString } from '../../src/ssr';
import {
  buildSsrLayoutRouteFixture,
  tier2BenchOptions,
} from '../shared/_shared';

const fixture = buildSsrLayoutRouteFixture();
const html = renderToString({
  url: fixture.url,
  registry: fixture.registry,
});

expect(html).toContain(fixture.shellMarker);
expect(html).toContain(fixture.expectedMarker);

describe('tier2 ssr layout route', () => {
  bench(
    'render a nested layout route with params query and hash',
    () => {
      renderToString({
        url: fixture.url,
        registry: fixture.registry,
      });
    },
    tier2BenchOptions
  );
});
