import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { createRouteRegistry, route } from '../../../src/router/route';
import { defer, Resolve, routeData } from '../../../src/router/deferred';
import { renderRouteRequest } from '../../../src/ssr';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

type DeferredPageData = { message: ReturnType<typeof defer<string>> };

function deferredPage() {
  const data = routeData<DeferredPageData>();
  return (
    <main>
      <Resolve
        value={data.message}
        pending={<p id="pending">loading</p>}
        rejected={(error) => <p id="rejected">{String(error)}</p>}
      >
        {(message) => <p id="ready">{message}</p>}
      </Resolve>
    </main>
  );
}

describe('deferred route streaming', () => {
  it('should flush fallback first and then emit a deterministic fulfilled patch', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const registry = createRouteRegistry(() => {
      route('/', deferredPage, { loader: () => ({ message: defer(pending) }) });
    });

    const result = await renderRouteRequest({ url: '/', registry });
    expect(result.kind).toBe('render');
    if (result.kind !== 'render' || !result.stream)
      throw new Error('expected stream');
    const reader = result.stream.getReader();
    const decoder = new TextDecoder();

    const first = decoder.decode((await reader.read()).value);
    expect(first).toContain('<askr-resolve data-askr-deferred="d:0">');
    expect(first).toContain('loading');
    expect(first).not.toContain('ready');
    expect(first).not.toContain('data-askr-render-data');

    release('ready');
    const patch = decoder.decode((await reader.read()).value);
    expect(patch).toContain('data-askr-deferred-patch="d:0"');
    expect(patch).toContain('<p id="ready">ready</p>');
    const hydration = decoder.decode((await reader.read()).value);
    expect(hydration).toContain('data-askr-render-data="true"');
    expect(hydration).toContain('__askr_deferred__');
    expect((await reader.read()).done).toBe(true);
  });

  it('should render the rejected branch without failing the response stream', async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<string>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const registry = createRouteRegistry(() => {
      route('/', deferredPage, {
        loader: () => ({ message: defer(pending) }),
      });
    });

    const result = await renderRouteRequest({ url: '/', registry });
    if (result.kind !== 'render' || !result.stream)
      throw new Error('expected stream');
    reject(new Error('nope'));
    const html = await new Response(result.stream).text();

    expect(html).toContain('data-askr-deferred-patch="d:0"');
    expect(html).toContain('<p id="rejected">Error: nope</p>');
    expect(html).toContain('"__askr_deferred__":"rejected"');
  });

  it('should close cleanly when the request is aborted', async () => {
    const pending = new Promise<string>(() => undefined);
    const controller = new AbortController();
    const registry = createRouteRegistry(() => {
      route('/', deferredPage, { loader: () => ({ message: defer(pending) }) });
    });
    const result = await renderRouteRequest({
      url: '/',
      registry,
      signal: controller.signal,
    });
    if (result.kind !== 'render' || !result.stream)
      throw new Error('expected stream');
    const reader = result.stream.getReader();
    await reader.read();
    controller.abort();

    expect((await reader.read()).done).toBe(true);
  });

  it('should emit boundary patches in registration order', async () => {
    let first!: (value: string) => void;
    let second!: (value: string) => void;
    const firstPromise = new Promise<string>((resolve) => {
      first = resolve;
    });
    const secondPromise = new Promise<string>((resolve) => {
      second = resolve;
    });
    const registry = createRouteRegistry(() => {
      route(
        '/',
        () => {
          const data = routeData<{
            first: ReturnType<typeof defer<string>>;
            second: ReturnType<typeof defer<string>>;
          }>();
          return (
            <main>
              <Resolve value={data.first} pending={<i>first pending</i>}>
                {(value) => <b>{value}</b>}
              </Resolve>
              <Resolve value={data.second} pending={<i>second pending</i>}>
                {(value) => <b>{value}</b>}
              </Resolve>
            </main>
          );
        },
        {
          loader: () => ({
            first: defer(firstPromise),
            second: defer(secondPromise),
          }),
        }
      );
    });
    const result = await renderRouteRequest({ url: '/', registry });
    if (result.kind !== 'render' || !result.stream)
      throw new Error('expected stream');
    const reader = result.stream.getReader();
    const decoder = new TextDecoder();
    await reader.read();
    second('second');
    first('first');

    expect(decoder.decode((await reader.read()).value)).toContain(
      'data-askr-deferred-patch="d:0"'
    );
    expect(decoder.decode((await reader.read()).value)).toContain(
      'data-askr-deferred-patch="d:1"'
    );
  });

  it('should hydrate the streamed result from settled data without rerunning the loader', async () => {
    const { container, cleanup } = createTestContainer();
    let loads = 0;
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const registry = createRouteRegistry(() => {
      route('/', deferredPage, {
        loader: () => {
          loads += 1;
          return { message: defer(pending) };
        },
      });
    });

    try {
      const result = await renderRouteRequest({ url: '/', registry });
      if (result.kind !== 'render' || !result.stream)
        throw new Error('expected stream');
      release('adopted');
      const streamedHtml = await new Response(result.stream).text();
      expect(streamedHtml.match(/data-askr-render-data/g)).toHaveLength(1);
      container.innerHTML = streamedHtml;

      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: false },
      });

      expect(container.querySelector('#ready')?.textContent).toBe('adopted');
      expect(container.querySelector('#pending')).toBeNull();
      expect(loads).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should hydrate a rejected boundary without rerunning the loader', async () => {
    const { container, cleanup } = createTestContainer();
    let loads = 0;
    let reject!: (error: Error) => void;
    const pending = new Promise<string>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const registry = createRouteRegistry(() => {
      route('/', deferredPage, {
        loader: () => {
          loads += 1;
          return { message: defer(pending) };
        },
      });
    });

    try {
      const result = await renderRouteRequest({ url: '/', registry });
      if (result.kind !== 'render' || !result.stream)
        throw new Error('expected stream');
      reject(new Error('adopted failure'));
      const streamedHtml = await new Response(result.stream).text();
      expect(streamedHtml.match(/data-askr-render-data/g)).toHaveLength(1);
      container.innerHTML = streamedHtml;

      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: false },
      });

      expect(container.querySelector('#rejected')?.textContent).toBe(
        'adopted failure'
      );
      expect(loads).toBe(1);
    } finally {
      cleanup();
    }
  });
});
