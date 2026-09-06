import { describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import {
  createRouteRegistry,
  currentAuth,
  route,
} from '../../../src/router/route';
import { defer, Resolve, routeData } from '../../../src/router/deferred';
import { state } from '../../../src/runtime/reactivity/state';
import {
  renderRouteRequest,
  renderRouteRequestToString,
} from '../../../src/ssr';
import type { AuthContext } from '@askrjs/auth';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

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

function DeferredCounter({ message }: { message: string }) {
  const count = state(0);
  return (
    <button id="ready" onClick={() => count.set((value) => value + 1)}>
      {`${message}:${String(count())}`}
    </button>
  );
}

function reactiveDeferredPage() {
  const data = routeData<DeferredPageData>();
  return (
    <main>
      <Resolve value={data.message} pending={<p id="pending">loading</p>}>
        {(message) => <DeferredCounter message={message} />}
      </Resolve>
    </main>
  );
}

describe('deferred route streaming', () => {
  it('should retain request-local auth when a deferred boundary renders after another request', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const alice: AuthContext = {
      authenticated: true,
      principal: { id: 'alice' },
      session: null,
      tenant: null,
    };
    const bob: AuthContext = {
      authenticated: true,
      principal: { id: 'bob' },
      session: null,
      tenant: null,
    };
    const aliceRegistry = createRouteRegistry(() => {
      route(
        '/',
        () => {
          const data = routeData<DeferredPageData>();
          return (
            <Resolve value={data.message} pending={<p>pending</p>}>
              {() => <p id="identity">{currentAuth().principal?.id}</p>}
            </Resolve>
          );
        },
        { loader: () => ({ message: defer(pending) }) }
      );
    });
    const bobRegistry = createRouteRegistry(() => {
      route('/', () => <p>{currentAuth().principal?.id}</p>);
    });

    const aliceResult = await renderRouteRequest({
      url: '/',
      registry: aliceRegistry,
      authContext: alice,
    });
    if (aliceResult.kind !== 'render' || !aliceResult.stream) {
      throw new Error('expected Alice stream');
    }
    const reader = aliceResult.stream.getReader();
    await reader.read();

    const bobResult = await renderRouteRequestToString({
      url: '/',
      registry: bobRegistry,
      authContext: bob,
    });
    expect(bobResult.kind).toBe('render');

    release('ready');
    const patch = new TextDecoder().decode((await reader.read()).value);
    expect(patch).toContain('<p id="identity">alice</p>');
    expect(patch).not.toContain('bob');
  });

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

  it('should hydrate a reactive streamed result without rerunning the loader', async () => {
    const { container, cleanup } = createTestContainer();
    let loads = 0;
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const registry = createRouteRegistry(() => {
      route('/', reactiveDeferredPage, {
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

      const button = container.querySelector('#ready') as HTMLButtonElement;
      expect(button.textContent).toBe('adopted:0');
      expect(container.querySelector('#pending')).toBeNull();
      expect(loads).toBe(1);

      button.click();
      flushScheduler();

      expect(container.querySelector('#ready')).toBe(button);
      expect(button.textContent).toBe('adopted:1');
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

  it('should stream a dehydrated deferred subset while rendering with complete data', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const registry = createRouteRegistry(() => {
      route(
        '/subset',
        () => {
          const data = routeData<{
            serverOnly: string;
            message: ReturnType<typeof defer<string>>;
          }>();
          return (
            <Resolve value={data.message} pending={<p>pending</p>}>
              {(message) => <p>{`${data.serverOnly}:${message}`}</p>}
            </Resolve>
          );
        },
        {
          loader: () => ({
            serverOnly: 'full',
            message: defer(pending),
          }),
          dehydrate: (data) => ({ message: data.message }),
        }
      );
    });

    const result = await renderRouteRequest({ url: '/subset', registry });
    if (result.kind !== 'render' || !result.stream)
      throw new Error('expected stream');
    release('ready');
    const html = await new Response(result.stream).text();

    expect(html).toContain('<p>full:ready</p>');
    expect(html).toContain('"__askr_deferred__":"fulfilled"');
    expect(html).not.toContain('"serverOnly":"full"');
  });
});
