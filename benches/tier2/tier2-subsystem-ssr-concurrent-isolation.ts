import { bench, describe, expect } from 'vite-plus/test';
import { renderResolvedToStringSync } from '../../src/ssr';
import {
  buildConcurrentSsrRequests,
  tier2BenchOptions,
} from '../shared/_shared';

const requests = buildConcurrentSsrRequests(16);

await (async () => {
  const htmlOutputs = await Promise.all(
    requests.map((request) =>
      Promise.resolve().then(() =>
        renderResolvedToStringSync({
          url: request.url,
          routes: request.routes,
          handler: request.routes[0].handler,
          params: { id: request.url.split('/')[2].split('?')[0] },
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
            renderResolvedToStringSync({
              url: request.url,
              routes: request.routes,
              handler: request.routes[0].handler,
              params: { id: request.url.split('/')[2].split('?')[0] },
              options: request.options,
            })
          )
        )
      );
    },
    tier2BenchOptions
  );
});
