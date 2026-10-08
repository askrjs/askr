import { describe, expect, test } from 'vite-plus/test';
import { renderToString } from '../../src/ssr';
import {
  buildSsrLayoutRouteFixture,
  tier2BenchOptions,
  runBench,
} from '../shared/_shared';

const fixture = buildSsrLayoutRouteFixture();
const html = renderToString({
  url: fixture.url,
  registry: fixture.registry,
});

expect(html).toContain(fixture.shellMarker);
expect(html).toContain(fixture.expectedMarker);

describe('tier2 ssr layout route', () => {
  test('render a nested layout route with params query and hash', async ({
    bench,
  }) => {
    await runBench(
      bench,
      'render a nested layout route with params query and hash',
      () => {
        renderToString({
          url: fixture.url,
          registry: fixture.registry,
        });
      },
      { ...tier2BenchOptions, iterations: 100_000 }
    );
  });
});
