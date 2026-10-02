import { describe, expect, test } from 'vite-plus/test';
import { renderResolvedForHydrationSync } from '../../src/ssr/render-resolved';
import {
  buildConcurrentSsrRequests,
  tier2BenchOptions,
  runBench,
} from '../shared/_shared';

const requests = buildConcurrentSsrRequests(16);

await (async () => {
  const htmlOutputs = await Promise.all(
    requests.map((request) =>
      Promise.resolve().then(() =>
        renderResolvedForHydrationSync(
          {
            url: request.url,
            registry: request.registry,
            handler: request.routes[0].handler,
            params: { id: request.url.split('/')[2].split('?')[0] },
            options: request.options,
          },
          undefined
        )
      )
    )
  );

  htmlOutputs.forEach((html, index) => {
    expect(html).toContain(requests[index].expectedMarker);
  });
})();

describe('tier2 ssr concurrent isolation', () => {
  test('render 16 isolated SSR requests in parallel', async ({ bench }) => {
    await runBench(
      bench,
      'render 16 isolated SSR requests in parallel',
      async () => {
        await Promise.all(
          requests.map((request) =>
            Promise.resolve().then(() =>
              renderResolvedForHydrationSync(
                {
                  url: request.url,
                  registry: request.registry,
                  handler: request.routes[0].handler,
                  params: { id: request.url.split('/')[2].split('?')[0] },
                  options: request.options,
                },
                undefined
              )
            )
          )
        );
      },
      tier2BenchOptions
    );
  });
});
