import { expect, it, vi } from 'vite-plus/test';
import { createRouteRegistry, route } from '../../../src/router/route';
import { renderRouteRequestToString } from '../../../src/ssr';

it('should accept a relative route URL aligned with the explicit request', async () => {
  const registry = createRouteRegistry(() => {
    route('/rendered', () => <main>rendered</main>);
  });

  const result = await renderRouteRequestToString({
    url: '/rendered?tenant=one',
    request: new Request('https://example.com/rendered?tenant=one'),
    registry,
  });

  expect(result.kind).toBe('render');
});

it('should reject a request whose URL disagrees with the route URL before loading', async () => {
  const loader = vi.fn(async () => ({ loaded: true }));
  const registry = createRouteRegistry(() => {
    route('/rendered', () => <main>rendered</main>, { loader });
  });

  await expect(
    renderRouteRequestToString({
      url: '/rendered?tenant=one',
      request: new Request('http://localhost/other?tenant=two'),
      registry,
    })
  ).rejects.toThrow(/request URL must match/i);
  expect(loader).not.toHaveBeenCalled();
});

it('should propagate the render abort signal through an explicit Request', async () => {
  let loaderStarted!: () => void;
  let requestSignal!: AbortSignal;
  const started = new Promise<void>((resolve) => {
    loaderStarted = resolve;
  });
  const registry = createRouteRegistry(() => {
    route('/rendered', () => <main>rendered</main>, {
      loader: ({ signal, request }) => {
        requestSignal = request!.signal;
        loaderStarted();
        return new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve({ aborted: true }), {
            once: true,
          });
        });
      },
    });
  });
  const controller = new AbortController();
  const rendering = renderRouteRequestToString({
    url: '/rendered',
    request: new Request('http://localhost/rendered'),
    registry,
    signal: controller.signal,
  }).catch(() => undefined);

  await started;
  controller.abort();
  await Promise.resolve();
  expect(requestSignal.aborted).toBe(true);
  await rendering;
});

it('should preserve an explicit Request body while composing its signal', async () => {
  const registry = createRouteRegistry(() => {
    route('/rendered', () => <main>rendered</main>, {
      loader: async ({ request }) => request!.text(),
    });
  });
  const result = await renderRouteRequestToString({
    url: '/rendered',
    request: new Request('http://localhost/rendered', {
      method: 'POST',
      body: 'request body',
    }),
    registry,
    signal: new AbortController().signal,
  });

  expect(result.kind).toBe('render');
  expect(result.kind === 'render' ? result.html : '').toContain('request body');
});
