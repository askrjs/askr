import { describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import {
  createRouteRegistry,
  currentAuth,
  route,
} from '../../../src/router/route';
import { currentRoute } from '../../../src/router/activity';
import { Link } from '../../../src/components/link';
import { defer, Resolve, routeData } from '../../../src/router/deferred';
import { state } from '../../../src/runtime/reactivity/state';
import {
  renderRouteRequest,
  renderRouteRequestToString,
} from '../../../src/ssr';
import { REDACTED_DEFERRED_ERROR } from '../../../src/ssr/hydration-data';
import {
  defineQuery,
  defineServerQueries,
  serveQuery,
} from '../../../src/data';
import type { AuthContext } from '@askrjs/auth';
import { JSDOM } from 'jsdom';
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

type NestedOuter = { label: string; inner: Promise<string> };
type NestedPageData = {
  outer: ReturnType<
    typeof defer<{ label: string; inner: ReturnType<typeof defer<string>> }>
  >;
};

function nestedPage() {
  const data = routeData<NestedPageData>();
  return (
    <main>
      <Resolve value={data.outer} pending={<p id="outer-pending">loading</p>}>
        {(outer) => (
          <section>
            <h1 id="outer">{outer.label}</h1>
            <Resolve
              value={outer.inner}
              pending={<p id="inner-pending">inner loading</p>}
              rejected={(error) => (
                <p id="inner-rejected">{`${String(error)}|${
                  currentAuth().principal?.id ?? ''
                }`}</p>
              )}
            >
              {(inner) => (
                <p id="inner">{`${inner}|${
                  currentRoute<{ id: string }>().params.id ?? ''
                }`}</p>
              )}
            </Resolve>
          </section>
        )}
      </Resolve>
    </main>
  );
}

/** Parse streamed HTML with its inline patch scripts executing as a browser would. */
function parseWithInlinePatches(html: string): Document {
  const dom = new JSDOM(`<!doctype html><body><div id="root">${html}</div>`, {
    runScripts: 'dangerously',
  });
  return dom.window.document;
}

function twoBoundaryPage() {
  const data = routeData<{
    first: ReturnType<typeof defer<string>>;
    second: ReturnType<typeof defer<string>>;
  }>();
  return (
    <main>
      <Resolve value={data.first} pending={<i>first pending</i>}>
        {(value) => <b id="first">{value}</b>}
      </Resolve>
      <Resolve value={data.second} pending={<i>second pending</i>}>
        {(value) => <b id="second">{value}</b>}
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

  it('should render deferred boundaries with the request route, base path and params', async () => {
    const { container, cleanup } = createTestContainer();
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    function RouteProbe({ message }: { message: string }) {
      const snapshot = currentRoute<{ id: string }>();
      return (
        <p id="route">
          {`${message}|${snapshot.path}|${snapshot.params.id ?? ''}|${
            snapshot.query.get('tab') ?? ''
          }|${String(snapshot.matches.length)}`}
          <Link href="/r/7">next</Link>
        </p>
      );
    }
    const registry = createRouteRegistry(
      () => {
        route(
          '/r/{id}',
          () => {
            const data = routeData<DeferredPageData>();
            return (
              <main>
                <Resolve value={data.message} pending={<p>loading</p>}>
                  {(message) => <RouteProbe message={message} />}
                </Resolve>
              </main>
            );
          },
          { loader: () => ({ message: defer(pending) }) }
        );
      },
      { basePath: '/app' }
    );
    const url = '/app/r/42?tab=info';

    try {
      const result = await renderRouteRequest({ url, registry });
      if (result.kind !== 'render' || !result.stream)
        throw new Error('expected stream');
      release('ready');
      const streamedHtml = await new Response(result.stream).text();
      expect(streamedHtml).toContain(
        '<p id="route">ready|/r/42|42|info|1<a href="/app/r/7"'
      );

      window.history.replaceState({}, '', url);
      container.innerHTML = streamedHtml;
      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      });

      expect(container.querySelector('#route')?.textContent).toBe(
        'ready|/r/42|42|info|1next'
      );
      expect(container.querySelector('a')?.getAttribute('href')).toBe(
        '/app/r/7'
      );
    } finally {
      window.history.replaceState({}, '', '/');
      cleanup();
    }
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

  it('should keep rejection reasons out of the hydration payload unless exposed', async () => {
    const renderPayload = async (error: Error) => {
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
      reject(error);
      const html = await new Response(result.stream).text();
      const payload =
        /<script type="application\/json" data-askr-render-data="true">(.*?)<\/script>/s.exec(
          html
        )?.[1];
      if (!payload) throw new Error('expected hydration payload');
      return payload;
    };

    const hidden = await renderPayload(
      new Error('DB password=hunter2 at 10.0.0.5')
    );
    expect(hidden).not.toContain('hunter2');
    expect(hidden).toContain(`"error":"${REDACTED_DEFERRED_ERROR}"`);

    const exposed = await renderPayload(
      Object.assign(new Error('Try again later'), { expose: true })
    );
    expect(exposed).toContain('"error":"Try again later"');
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

  it('should emit each boundary patch as soon as it settles', async () => {
    let first!: (value: string) => void;
    let second!: (value: string) => void;
    const firstPromise = new Promise<string>((resolve) => {
      first = resolve;
    });
    const secondPromise = new Promise<string>((resolve) => {
      second = resolve;
    });
    const registry = createRouteRegistry(() => {
      route('/', twoBoundaryPage, {
        loader: () => ({
          first: defer(firstPromise),
          second: defer(secondPromise),
        }),
      });
    });
    const { container, cleanup } = createTestContainer();
    try {
      const result = await renderRouteRequest({ url: '/', registry });
      if (result.kind !== 'render' || !result.stream)
        throw new Error('expected stream');
      const reader = result.stream.getReader();
      const decoder = new TextDecoder();
      const shell = decoder.decode((await reader.read()).value);
      second('second');

      // `first` is still pending: the settled later boundary must not wait on it.
      const secondPatch = decoder.decode((await reader.read()).value);
      expect(secondPatch).toContain('data-askr-deferred-patch="d:1"');
      expect(secondPatch).toContain('<b id="second">second</b>');
      first('first');
      const firstPatch = decoder.decode((await reader.read()).value);
      expect(firstPatch).toContain('data-askr-deferred-patch="d:0"');
      expect(firstPatch).toContain('<b id="first">first</b>');
      const hydration = decoder.decode((await reader.read()).value);
      expect(hydration).toContain('data-askr-render-data="true"');
      expect((await reader.read()).done).toBe(true);

      const streamed = shell + secondPatch + firstPatch + hydration;
      const inline = parseWithInlinePatches(streamed);
      expect(inline.querySelector('#first')?.textContent).toBe('first');
      expect(inline.querySelector('#second')?.textContent).toBe('second');
      expect(
        inline.querySelector(
          'askr-resolve, template, [data-askr-deferred-apply]'
        )
      ).toBeNull();

      container.innerHTML = streamed;
      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      });
      expect(container.querySelector('#first')?.textContent).toBe('first');
      expect(container.querySelector('#second')?.textContent).toBe('second');
      expect(container.querySelector('askr-resolve')).toBeNull();
      expect(container.querySelector('template')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('should stream and hydrate a Resolve nested inside a deferred boundary', async () => {
    let releaseOuter!: (value: NestedOuter) => void;
    let releaseInner!: (value: string) => void;
    const outerPromise = new Promise<NestedOuter>((resolve) => {
      releaseOuter = resolve;
    });
    const innerPromise = new Promise<string>((resolve) => {
      releaseInner = resolve;
    });
    const registry = createRouteRegistry(() => {
      route('/n/{id}', nestedPage, {
        loader: () => ({
          outer: defer(
            outerPromise.then((value) => ({
              ...value,
              inner: defer(value.inner),
            }))
          ),
        }),
      });
    });
    const { container, cleanup } = createTestContainer();
    try {
      const result = await renderRouteRequest({ url: '/n/7', registry });
      if (result.kind !== 'render' || !result.stream)
        throw new Error('expected stream');
      const reader = result.stream.getReader();
      const decoder = new TextDecoder();
      const shell = decoder.decode((await reader.read()).value);

      releaseOuter({ label: 'outer', inner: innerPromise });
      const outerPatch = decoder.decode((await reader.read()).value);
      expect(outerPatch).toContain('data-askr-deferred-patch="d:0"');
      expect(outerPatch).toContain('<askr-resolve data-askr-deferred="d:0.0">');
      expect(outerPatch).toContain('inner loading');

      releaseInner('inner');
      const rest = await new Response(
        new ReadableStream({
          async pull(controller) {
            const chunk = await reader.read();
            if (chunk.done) controller.close();
            else controller.enqueue(chunk.value);
          },
        })
      ).text();
      expect(rest).toContain('data-askr-deferred-patch="d:0.0"');
      expect(rest).toContain('<p id="inner">inner|7</p>');
      expect(rest).toContain('"__askr_deferred__":"fulfilled","value":"inner"');

      window.history.replaceState({}, '', '/n/7');
      const streamed = shell + outerPatch + rest;
      const inline = parseWithInlinePatches(streamed);
      expect(inline.querySelector('#outer')?.textContent).toBe('outer');
      expect(inline.querySelector('#inner')?.textContent).toBe('inner|7');
      expect(
        inline.querySelector(
          'askr-resolve, template, [data-askr-deferred-apply]'
        )
      ).toBeNull();

      container.innerHTML = streamed;
      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      });
      expect(container.querySelector('#outer')?.textContent).toBe('outer');
      expect(container.querySelector('#inner')?.textContent).toBe('inner|7');
      expect(container.querySelector('askr-resolve')).toBeNull();
    } finally {
      window.history.replaceState({}, '', '/');
      cleanup();
    }
  });

  it('should render a rejected nested boundary with request auth and a redacted payload', async () => {
    let rejectInner!: (error: Error) => void;
    const innerPromise = new Promise<string>((_resolve, reject) => {
      rejectInner = reject;
    });
    void innerPromise.catch(() => undefined);
    let releaseOuter!: () => void;
    const outerPromise = new Promise<void>((resolve) => {
      releaseOuter = resolve;
    });
    const registry = createRouteRegistry(() => {
      route('/n/{id}', nestedPage, {
        loader: () => ({
          outer: defer(
            outerPromise.then(() => ({
              label: 'outer',
              inner: defer(innerPromise),
            }))
          ),
        }),
      });
    });
    const result = await renderRouteRequest({
      url: '/n/1',
      registry,
      authContext: {
        authenticated: true,
        principal: { id: 'alice' },
        session: null,
        tenant: null,
      },
    });
    if (result.kind !== 'render' || !result.stream)
      throw new Error('expected stream');
    const reader = result.stream.getReader();
    const decoder = new TextDecoder();
    await reader.read();
    releaseOuter();
    await reader.read();
    rejectInner(new Error('DB password=hunter2'));
    let rest = '';
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      rest += decoder.decode(chunk.value);
    }

    expect(rest).toContain('data-askr-deferred-patch="d:0.0"');
    expect(rest).toContain(
      '<p id="inner-rejected">Error: DB password=hunter2|alice</p>'
    );
    const payload =
      /<script type="application\/json" data-askr-render-data="true">(.*?)<\/script>/s.exec(
        rest
      )?.[1];
    expect(payload).toContain(`"error":"${REDACTED_DEFERRED_ERROR}"`);
    expect(payload).not.toContain('hunter2');
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

  it('should hydrate an unexposed rejection with the redacted reason', async () => {
    const { container, cleanup } = createTestContainer();
    let reject!: (error: Error) => void;
    const pending = new Promise<string>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const registry = createRouteRegistry(() => {
      route('/', deferredPage, {
        loader: () => ({ message: defer(pending) }),
      });
    });

    try {
      const result = await renderRouteRequest({ url: '/', registry });
      if (result.kind !== 'render' || !result.stream)
        throw new Error('expected stream');
      reject(new Error('internal detail'));
      container.innerHTML = await new Response(result.stream).text();

      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: false },
      });

      expect(container.querySelector('#rejected')?.textContent).toBe(
        REDACTED_DEFERRED_ERROR
      );
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
      reject(Object.assign(new Error('adopted failure'), { expose: true }));
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

  it('should reject non-JSON preloaded query data before streaming the shell', async () => {
    const pending = new Promise<string>(() => undefined);
    const event = defineQuery({
      key: () => 'event:1',
      fetch: async () => ({ at: '' }),
    });
    const queryRegistry = defineServerQueries(
      serveQuery(event, () => ({ at: new Date(0) as unknown as string }))
    );
    const registry = createRouteRegistry(() => {
      route('/event', deferredPage, {
        preload: ({ data }) => data.prefetch(event, {}),
        loader: () => ({ message: defer(pending) }),
      });
    });

    await expect(
      renderRouteRequest({ url: '/event', registry, queryRegistry })
    ).rejects.toThrow(
      '[Askr] Query data for key "event:1" at "$.at" is not JSON transport-safe'
    );
  });
});
