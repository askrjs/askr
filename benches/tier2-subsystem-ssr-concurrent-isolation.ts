import { bench, describe, expect } from 'vitest';
import { renderToStringSyncForUrl } from '../src/ssr';
import {
  buildConcurrentSsrRequests,
  tier2BenchOptions,
} from './_shared';

const requests = buildConcurrentSsrRequests(16);

await (async () => {
  const htmlOutputs = await Promise.all(
    requests.map((request) =>
      Promise.resolve().then(() =>
        renderToStringSyncForUrl({
          url: request.url,
          routes: request.routes,
          options: request.options,
        })
      )
    )
  );

  htmlOutputs.forEach((html, index) => {
    expect(html).toContain(requests[index].expectedMarker);
  });
})();

describe('tier2 ssr concurrent isolation', () => {
  bench(
    'render 16 isolated SSR requests in parallel',
    async () => {
      await Promise.all(
        requests.map((request) =>
          Promise.resolve().then(() =>
            renderToStringSyncForUrl({
              url: request.url,
              routes: request.routes,
              options: request.options,
            })
          )
        )
      );
    },
    tier2BenchOptions
  );
});
