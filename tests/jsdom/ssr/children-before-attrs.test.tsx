import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { defineScope, readScope, state } from '../../../src';
import { hydrateSPA } from '../../../src/boot';
import { ErrorBoundary } from '../../../src/components';
import { currentOwner, onDispose } from '../../../src/core/api/hooks';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { jsx as typedJsx, type JSXElement } from '../../../src/jsx/jsx-runtime';
import {
  renderRouteRequest,
  renderToStream,
  renderToString,
  renderToStringSync,
} from '../../../src/ssr';
import { createRouteRegistry, route } from '../../../src/router/route';
import { defer, Resolve, routeData } from '../../../src/router/deferred';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

// This private sibling-package bridge is intentionally absent from public
// intrinsic prop types. The factory also permits unusual namespace test tags.
const jsx = typedJsx as unknown as (
  type: string,
  props: Record<string, unknown>
) => JSXElement;
const marker = Symbol.for('askr.ssr.children-before-attrs');
const optIn = { [marker]: true };

afterEach(() => {
  vi.restoreAllMocks();
  _resetDefaultPortal();
});

describe('SSR private children-before-attrs bridge', () => {
  it.each(['annotation-xml', 'select', 'option'])(
    'should preserve a late property getter on a marked %s host',
    (tag) => {
      let ready = false;
      let reads = 0;
      function Child() {
        ready = true;
        return tag === 'select' ? <option value="B">B</option> : 'B';
      }
      const host = jsx(tag, {
        ...optIn,
        ...(tag === 'annotation-xml'
          ? { encoding: 'text/html' }
          : { value: 'B' }),
        get 'data-ready'() {
          reads += 1;
          return ready ? 'yes' : undefined;
        },
        children: <Child />,
      });
      const html = renderToStringSync(() =>
        tag === 'annotation-xml' ? (
          jsx('math', { children: host })
        ) : tag === 'option' ? (
          <select value="B">{host}</select>
        ) : (
          host
        )
      );
      expect(html).toContain('data-ready="yes"');
      expect(reads).toBe(1);
    }
  );

  it('should withhold a marked value-less option prefix when its late attribute throws', () => {
    const failure = new Error('option late attribute failure');
    const chunks: string[] = [];
    const registry = routeRegistryFromTable([
      {
        path: '/',
        handler: () => (
          <select value="B">
            <option
              {...optIn}
              title={() => {
                throw failure;
              }}
            >
              B
            </option>
          </select>
        ),
      },
    ]);
    expect(() =>
      renderToStream({
        url: '/',
        registry,
        onChunk: (chunk) => chunks.push(chunk),
        onComplete: () => {},
      })
    ).toThrow(failure);
    expect(chunks.join('')).toBe('<select value="B">');
  });

  it('should evaluate a wrapped scoped child once before resolving an opted-in host attribute', () => {
    const Scope = defineScope('default');
    const order: string[] = [];
    let labelled = false;
    let reads = 0;
    let cleanups = 0;
    function WrappedLabel() {
      order.push(`child:${readScope(Scope)}:${state(7)()}`);
      onDispose(currentOwner()!, () => {
        cleanups += 1;
      });
      labelled = true;
      return <span id="wrapped-label">Label &amp; text</span>;
    }
    const html = renderToStringSync(() => (
      <Scope value="scoped">
        <div
          {...optIn}
          aria-labelledby={() => {
            reads += 1;
            order.push('attribute');
            return labelled ? 'wrapped-label' : undefined;
          }}
        >
          <WrappedLabel />
        </div>
      </Scope>
    ));
    expect(html).toBe(
      '<div aria-labelledby="wrapped-label"><span id="wrapped-label">Label &amp; text</span></div>'
    );
    expect(order).toEqual(['child:scoped:7', 'attribute']);
    expect(reads).toBe(1);
    expect(cleanups).toBe(1);
  });

  it.each([undefined, false, 'true'])(
    'should retain legacy attribute-first order for marker value %s',
    (value) => {
      const order: string[] = [];
      let labelled = false;
      function Child() {
        order.push('child');
        labelled = true;
        return <span>Child</span>;
      }
      const html = renderToStringSync(() =>
        jsx('div', {
          [marker]: value,
          'aria-labelledby': () => {
            order.push('attribute');
            return labelled ? 'label' : undefined;
          },
          children: <Child />,
        })
      );
      expect(html).toBe('<div><span>Child</span></div>');
      expect(order).toEqual(['attribute', 'child']);
    }
  );

  it('should resolve nested opted-in hosts in descendant order without reevaluating children', () => {
    const order: string[] = [];
    function Child() {
      order.push('child');
      return <b>Once</b>;
    }
    const html = renderToStringSync(() => (
      <div
        {...optIn}
        title={() => {
          order.push('outer');
          return 'Outer';
        }}
      >
        <section
          {...optIn}
          title={() => {
            order.push('inner');
            return 'Inner';
          }}
        >
          <Child />
        </section>
      </div>
    ));
    expect(html).toBe(
      '<div title="Outer"><section title="Inner"><b>Once</b></section></div>'
    );
    expect(order).toEqual(['child', 'inner', 'outer']);
  });

  it('should preserve static legacy bytes, escaped content and portal host operations when streaming', () => {
    function build(buffered: boolean) {
      return (
        <main>
          <header>Before</header>
          <section {...(buffered ? optIn : {})} title={'"<&'}>
            <DefaultPortal />
            <span>{'<child>&'}</span>
            <Portal>
              <aside>Overlay</aside>
            </Portal>
          </section>
          <footer>After</footer>
        </main>
      );
    }
    const expected = renderToStringSync(() => build(false));
    _resetDefaultPortal();
    const registry = routeRegistryFromTable([
      { path: '/', handler: () => build(true) },
    ]);
    const chunks: string[] = [];
    renderToStream({
      url: '/',
      registry,
      onChunk: (chunk) => chunks.push(chunk),
      onComplete: () => {},
    });
    expect(chunks.join('')).toBe(expected);
    expect(renderToString({ url: '/', registry })).toBe(expected);
    expect(expected).toContain('&quot;&lt;&amp;');
    expect(expected).toContain('&lt;child&gt;&amp;');
    expect(expected).toContain('<aside>Overlay</aside>');
  });

  it('should withhold an opted-in host and its children from streaming when its late attribute throws', () => {
    const failure = new Error('late attribute failure');
    const chunks: string[] = [];
    const registry = routeRegistryFromTable([
      {
        path: '/',
        handler: () => (
          <main>
            <p>Before</p>
            <section
              {...optIn}
              title={() => {
                throw failure;
              }}
            >
              <span>Withheld</span>
            </section>
          </main>
        ),
      },
    ]);
    expect(() =>
      renderToStream({
        url: '/',
        registry,
        onChunk: (chunk) => chunks.push(chunk),
        onComplete: () => {},
      })
    ).toThrow(failure);
    expect(chunks.join('')).toBe('<main><p>Before</p>');
  });

  it('should preserve boundary fallback and owned cleanup when an opted-in child throws', () => {
    let cleanups = 0;
    function Broken(): never {
      onDispose(currentOwner()!, () => {
        cleanups += 1;
      });
      throw new Error('child failure');
    }
    const html = renderToStringSync(() => (
      <ErrorBoundary fallback={<p>Fallback</p>}>
        <div {...optIn}>
          <span>Discarded</span>
          <Broken />
        </div>
      </ErrorBoundary>
    ));
    expect(html).toBe('<p>Fallback</p>');
    expect(cleanups).toBe(1);
  });

  it.each(['svg', 'math'])(
    'should preserve %s foreign content while resolving a late host attribute',
    (namespace) => {
      let childRendered = false;
      function Child() {
        childRendered = true;
        return jsx('script', { children: '<b>&' });
      }
      const html = renderToStringSync(() =>
        jsx(namespace, {
          [marker]: true,
          'data-ready': () => (childRendered ? 'yes' : undefined),
          children: <Child />,
        })
      );
      expect(html).toBe(
        `<${namespace} data-ready="yes"><script>&lt;b&gt;&amp;</script></${namespace}>`
      );
    }
  );

  it('should preserve annotation-xml HTML integration and read encoding once', () => {
    const encoding = vi.fn(() => 'text/html');
    const html = renderToStringSync(() =>
      jsx('math', {
        children: jsx('annotation-xml', {
          ...optIn,
          encoding,
          children: jsx('script', { children: 'if (a < b && c > d) {}' }),
        }),
      })
    );
    expect(html).toBe(
      '<math><annotation-xml encoding="text/html"><script>if (a < b && c > d) {}</script></annotation-xml></math>'
    );
    expect(encoding).toHaveBeenCalledTimes(1);
  });

  it.each(['annotation-xml', 'select', 'option'])(
    'should resolve only structural %s inputs before children and leave other attribute functions late',
    (tag) => {
      let ready = false;
      const structural = vi.fn(() =>
        tag === 'annotation-xml' ? 'text/html' : 'B'
      );
      const late = vi.fn(() => (ready ? 'yes' : undefined));
      function Child() {
        ready = true;
        return tag === 'select' ? <option value="B">B</option> : 'B';
      }
      const host = jsx(tag, {
        ...optIn,
        ...(tag === 'annotation-xml'
          ? { encoding: structural }
          : { value: structural }),
        'data-ready': late,
        children: <Child />,
      });
      const html = renderToStringSync(() =>
        tag === 'annotation-xml' ? (
          jsx('math', { children: host })
        ) : tag === 'option' ? (
          <select value="B">{host}</select>
        ) : (
          host
        )
      );
      expect(html).toContain('data-ready="yes"');
      expect(structural).toHaveBeenCalledTimes(1);
      expect(late).toHaveBeenCalledTimes(1);
      if (tag === 'option') expect(html).toContain('selected');
    }
  );

  it('should preserve reactive select state, value-less option buffering and sibling matching', () => {
    const selected = vi.fn(() => 'B');
    let renders = 0;
    function Text() {
      renders += 1;
      return 'B';
    }
    const html = renderToStringSync(() => (
      <select {...optIn} value={selected}>
        <option>A</option>
        <option {...optIn}>
          <Text />
        </option>
        <option value="B">Again</option>
      </select>
    ));
    expect(html).toBe(
      '<select value="B"><option>A</option><option selected>B</option><option value="B">Again</option></select>'
    );
    expect(selected).toHaveBeenCalledTimes(1);
    expect(renders).toBe(1);
  });

  it('should keep void children unevaluated and raw text escaped exactly as before', () => {
    let renders = 0;
    function Child() {
      renders += 1;
      return 'ignored';
    }
    expect(
      renderToStringSync(() => jsx('input', { ...optIn, children: <Child /> }))
    ).toBe('<input />');
    expect(renders).toBe(0);
    const raw = 'a > b { content: "</style>"; }';
    expect(
      renderToStringSync(() => jsx('style', { ...optIn, children: raw }))
    ).toBe(renderToStringSync(() => jsx('style', { children: raw })));
    expect(() =>
      renderToStringSync(() =>
        jsx('style', { ...optIn, children: <b>Invalid</b> })
      )
    ).toThrow();
  });

  it('should ignore the private symbol on the client while hydrating and updating the same nodes', async () => {
    function Counter() {
      const count = state(0);
      return <button onClick={() => count.set(count() + 1)}>{count()}</button>;
    }
    const App = () => (
      <div {...optIn} aria-label="Counter">
        <Counter />
      </div>
    );
    const { container, cleanup } = createTestContainer();
    try {
      container.innerHTML = renderToStringSync(App);
      const original = container.querySelector('button');
      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
        hydrate: { verifyMarkup: true },
      });
      flushScheduler();
      expect(container.querySelector('button')).toBe(original);
      original?.click();
      flushScheduler();
      expect(original?.textContent).toBe('1');
      expect(container.firstElementChild?.getAttributeNames()).toEqual([
        'aria-label',
      ]);
    } finally {
      cleanup();
    }
  });

  it('should preserve deferred fallback, late patch attributes and hydration transport in asynchronous streaming', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    let labelRenders = 0;
    function Labelled({ text }: { text: string }) {
      let labelled = false;
      function Label() {
        labelRenders += 1;
        labelled = true;
        return (
          <span id="deferred-label">
            {text}:{state(7)()}
          </span>
        );
      }
      return (
        <section
          {...optIn}
          aria-labelledby={() => (labelled ? 'deferred-label' : undefined)}
        >
          <Label />
        </section>
      );
    }
    function Page() {
      const data = routeData<{ message: ReturnType<typeof defer<string>> }>();
      return (
        <main {...optIn}>
          <Resolve value={data.message} pending={<p>Loading</p>}>
            {(text) => <Labelled text={text} />}
          </Resolve>
        </main>
      );
    }
    const registry = createRouteRegistry(() => {
      route('/', Page, { loader: () => ({ message: defer(pending) }) });
    });
    const result = await renderRouteRequest({ url: '/', registry });
    if (result.kind !== 'render' || !result.stream)
      throw new Error('expected stream');
    const reader = result.stream.getReader();
    const decoder = new TextDecoder();
    try {
      const fallback = decoder.decode((await reader.read()).value);
      expect(fallback).toContain('Loading');
      expect(fallback).not.toContain('deferred-label');
      release('Ready & safe');
      const patch = decoder.decode((await reader.read()).value);
      expect(patch).toContain(
        '<section aria-labelledby="deferred-label"><span id="deferred-label">Ready &amp; safe:7</span></section>'
      );
      expect(labelRenders).toBe(1);
      const hydration = decoder.decode((await reader.read()).value);
      expect(hydration).toContain('data-askr-render-data="true"');
      expect(hydration).toContain('__askr_deferred__');
      expect((await reader.read()).done).toBe(true);
    } finally {
      await reader.cancel();
    }
  });
});
