import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { defineScope, readScope } from '../../../src';
import { defer, Resolve, routeData } from '../../../src/router/deferred';
import { createRouteRegistry, route } from '../../../src/router/route';
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
  renderToStringSync,
} from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';

// Private sibling-package metadata; no intrinsic or public component prop.
const rootMarker = Symbol.for('askr.ssr.attribute-root');
const cellMarker = Symbol.for('askr.ssr.attribute-cells');
type Cell = { value: string | undefined };
const jsx = typedJsx as unknown as (
  type: string | ((props: { children?: unknown }) => unknown),
  props: Record<PropertyKey, unknown>
) => JSXElement;
function AttributeRoot(props: { children?: unknown }) {
  return <>{props.children}</>;
}
function root(children: unknown, enabled: unknown = true) {
  return jsx(AttributeRoot, { [rootMarker]: enabled, children });
}
function cells(values: Record<string, Cell>) {
  return { [cellMarker]: values };
}

afterEach(() => {
  vi.restoreAllMocks();
  _resetDefaultPortal();
});

describe('SSR private reference attribute cells', () => {
  it.each(['html', 'style', 'script'])(
    'should preserve a matching private-looking literal in %s before a real reference attribute',
    (kind) => {
      const literal = '<!--askr-attribute:0-->';
      const cell: Cell = { value: 'real-target' };
      const leading =
        kind === 'html' ? (
          <div dangerouslySetInnerHTML={{ __html: literal }} />
        ) : (
          jsx(kind, { children: `const literal = '${literal}';` })
        );
      const ordinaryLeading = renderToStringSync(() => leading);
      const html = renderToStringSync(() =>
        root(
          <>
            {leading}
            <button
              {...cells({ 'aria-controls': cell })}
              aria-controls="fallback"
            >
              Open
            </button>
            <section id="real-target">Body</section>
          </>
        )
      );
      expect(html).toBe(
        `${ordinaryLeading}<button aria-controls="real-target">Open</button><section id="real-target">Body</section>`
      );
    }
  );

  it('should discover later opaque sibling metadata without repeating ID or component evaluation', () => {
    const cell: Cell = { value: undefined };
    const order: string[] = [];
    let idReads = 0;
    let renders = 0;
    function Later() {
      renders++;
      order.push('later');
      const id = (() => {
        idReads++;
        return 'late-"<&';
      })();
      cell.value = id;
      return <section id={id}>Body</section>;
    }
    const html = renderToStringSync(() =>
      root(
        <>
          <button
            {...cells({ 'aria-controls': cell })}
            aria-controls="fallback"
            title={() => {
              order.push('ordinary');
              return 'Once';
            }}
          >
            Open
          </button>
          <Later />
        </>
      )
    );
    expect(html).toBe(
      '<button aria-controls="late-&quot;&lt;&amp;" title="Once">Open</button><section id="late-&quot;&lt;&amp;">Body</section>'
    );
    expect(order).toEqual(['ordinary', 'later']);
    expect({ idReads, renders }).toEqual({ idReads: 1, renders: 1 });
  });

  it.each([undefined, false, 'true'])(
    'should preserve ordinary fallback and evaluation order without an exact root marker, %s',
    (enabled) => {
      const cell: Cell = { value: 'cell' };
      const calls: string[] = [];
      function Later() {
        calls.push('child');
        return <span>Child</span>;
      }
      const html = renderToStringSync(() =>
        jsx(AttributeRoot, {
          [rootMarker]: enabled,
          children: (
            <div
              {...cells({ 'aria-labelledby': cell })}
              aria-labelledby={() => {
                calls.push('attribute');
                return 'fallback';
              }}
            >
              <Later />
            </div>
          ),
        })
      );
      expect(html).toBe(
        '<div aria-labelledby="fallback"><span>Child</span></div>'
      );
      expect(calls).toEqual(['attribute', 'child']);
    }
  );

  it('should omit an unresolved cell without calling its internal fallback getter', () => {
    const cell: Cell = { value: undefined };
    const fallback = vi.fn(() => 'missing');
    expect(
      renderToStringSync(() =>
        root(
          <div
            {...cells({ 'aria-labelledby': cell })}
            aria-labelledby={fallback}
          >
            Body
          </div>
        )
      )
    ).toBe('<div>Body</div>');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('should preserve ordinary caller attribute errors in their original boundary', () => {
    const cell: Cell = { value: 'label' };
    const failure = new Error('ordinary caller attribute');
    const read = vi.fn(() => {
      throw failure;
    });
    const html = renderToStringSync(() =>
      root(
        <>
          <ErrorBoundary fallback={<p>Recovered</p>}>
            <div
              {...cells({ 'aria-labelledby': cell })}
              aria-labelledby="fallback"
              title={read}
            >
              Discarded
            </div>
          </ErrorBoundary>
          <span id="label">Label</span>
        </>
      )
    );
    expect(html).toBe('<p>Recovered</p><span id="label">Label</span>');
    expect(read).toHaveBeenCalledOnce();
  });

  it('should discard boundary cell operations and owned failed metadata before fallback', () => {
    const cell: Cell = { value: undefined };
    let cleanups = 0;
    function Broken() {
      cell.value = 'discarded';
      onDispose(currentOwner()!, () => {
        cleanups++;
        cell.value = undefined;
      });
      throw new Error('discarded subtree');
    }
    const html = renderToStringSync(() =>
      root(
        <>
          <ErrorBoundary fallback={<p>Fallback</p>}>
            <div
              {...cells({ 'aria-labelledby': cell })}
              aria-labelledby="fallback"
            >
              <Broken />
            </div>
          </ErrorBoundary>
          <aside
            {...cells({ 'aria-labelledby': cell })}
            aria-labelledby="missing"
          >
            Body
          </aside>
        </>
      )
    );
    expect(html).toBe('<p>Fallback</p><aside>Body</aside>');
    expect(cleanups).toBe(1);
  });

  it('should retain metadata cell operations through a successful boundary buffer', () => {
    const cell: Cell = { value: undefined };
    function Later() {
      cell.value = 'later';
      return <h2 id="later">Title</h2>;
    }
    expect(
      renderToStringSync(() =>
        root(
          <>
            <ErrorBoundary fallback={<p>Fallback</p>}>
              <div
                {...cells({ 'aria-labelledby': cell })}
                aria-labelledby="fallback"
              >
                Body
              </div>
            </ErrorBoundary>
            <Later />
          </>
        )
      )
    ).toBe('<div aria-labelledby="later">Body</div><h2 id="later">Title</h2>');
  });

  it('should retain scoped metadata and independent nested roots', () => {
    const Scope = defineScope('default');
    const outer: Cell = { value: undefined };
    const inner: Cell = { value: undefined };
    const reads: string[] = [];
    function Label({ cell }: { cell: Cell }) {
      const id = readScope(Scope);
      reads.push(id);
      cell.value = id;
      return <h2 id={id}>{id}</h2>;
    }
    const html = renderToStringSync(() =>
      root(
        <Scope value="outer">
          <div
            {...cells({ 'aria-labelledby': outer })}
            aria-labelledby="fallback"
          />
          <Scope value="inner">
            {root(
              <>
                <div
                  {...cells({ 'aria-labelledby': inner })}
                  aria-labelledby="fallback"
                />
                <Label cell={inner} />
              </>
            )}
          </Scope>
          <Label cell={outer} />
        </Scope>
      )
    );
    expect(html).toBe(
      '<div aria-labelledby="outer"></div><div aria-labelledby="inner"></div><h2 id="inner">inner</h2><h2 id="outer">outer</h2>'
    );
    expect(reads).toEqual(['inner', 'outer']);
  });

  it('should resolve reference metadata only after its portaled target renders once', () => {
    const cell: Cell = { value: undefined };
    let renders = 0;
    function Content() {
      renders++;
      cell.value = 'portaled';
      return <section id="portaled">Body</section>;
    }
    const html = renderToStringSync(() =>
      root(
        <>
          <button
            {...cells({ 'aria-controls': cell })}
            aria-controls="fallback"
          >
            Open
          </button>
          <DefaultPortal />
          <Portal>
            <Content />
          </Portal>
        </>
      )
    );
    expect(html).toContain('aria-controls="portaled"');
    expect(html).toContain('<section id="portaled">Body</section>');
    expect(renders).toBe(1);
  });

  it('should keep unrelated select and namespace evaluation unchanged', () => {
    const build = () => (
      <>
        <select value="B">
          <option>A</option>
          <option>B</option>
        </select>
        <svg>
          <foreignObject>
            <div>HTML</div>
          </foreignObject>
        </svg>
        <math>
          <annotation-xml encoding="text/html">
            <div>HTML</div>
          </annotation-xml>
        </math>
      </>
    );
    expect(renderToStringSync(() => root(build()))).toBe(
      renderToStringSync(build)
    );
  });

  it('should withhold a marked root from streaming when an ordinary attribute throws', () => {
    const failure = new Error('root caller attribute');
    const chunks: string[] = [];
    const registry = routeRegistryFromTable([
      {
        path: '/',
        handler: () => (
          <main>
            <p>Before</p>
            {root(
              <>
                <span>Discarded prefix</span>
                <div
                  title={() => {
                    throw failure;
                  }}
                >
                  Discarded
                </div>
              </>
            )}
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

  it('should finalize stream reference cells after portaled targets without emitting private tokens', () => {
    let renders = 0;
    const cell: Cell = { value: undefined };
    function Content() {
      renders++;
      cell.value = 'stream-content';
      return <section id="stream-content">Body</section>;
    }
    const registry = routeRegistryFromTable([
      {
        path: '/',
        handler: () => (
          <main>
            <p>Before</p>
            {root(
              <>
                <button
                  {...cells({ 'aria-controls': cell })}
                  aria-controls="fallback"
                >
                  Open
                </button>
                <DefaultPortal />
                <Portal>
                  <Content />
                </Portal>
              </>
            )}
            <p>After</p>
          </main>
        ),
      },
    ]);
    const chunks: string[] = [];
    renderToStream({
      url: '/',
      registry,
      onChunk: (chunk) => chunks.push(chunk),
      onComplete: () => {},
    });
    const html = chunks.join('');
    expect(html).toContain(
      '<button aria-controls="stream-content">Open</button>'
    );
    expect(html).toContain('<section id="stream-content">Body</section>');
    expect(html).not.toContain('askr-attribute:');
    expect(renders).toBe(1);
  });

  it('should reject nonprimitive cells inside their original boundary before publishing a root prefix', () => {
    const invalid = {
      get value() {
        throw new Error('must not invoke a cell getter');
      },
    } as Cell;
    const html = renderToStringSync(() =>
      root(
        <ErrorBoundary fallback={<p>Invalid cell</p>}>
          <div
            {...cells({ 'aria-labelledby': invalid })}
            aria-labelledby="fallback"
          >
            Discarded
          </div>
        </ErrorBoundary>
      )
    );
    expect(html).toBe('<p>Invalid cell</p>');
  });

  it('should finalize cells in a deferred stream patch once before hydration transport', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    let renders = 0;
    function Ready({ text }: { text: string }) {
      const cell: Cell = { value: undefined };
      function Label() {
        renders++;
        cell.value = 'deferred-title';
        return <h2 id="deferred-title">Ready</h2>;
      }
      return root(
        <>
          <section
            {...cells({ 'aria-labelledby': cell })}
            aria-labelledby="fallback"
          >
            {text}
          </section>
          <Label />
        </>
      );
    }
    function Page() {
      const data = routeData<{ message: ReturnType<typeof defer<string>> }>();
      return (
        <Resolve value={data.message} pending={<p>Loading</p>}>
          {(text) => <Ready text={text} />}
        </Resolve>
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
      expect(decoder.decode((await reader.read()).value)).toContain('Loading');
      release('Ready & safe');
      const patch = decoder.decode((await reader.read()).value);
      expect(patch).toContain(
        '<section aria-labelledby="deferred-title">Ready &amp; safe</section><h2 id="deferred-title">Ready</h2>'
      );
      expect(patch).not.toContain('askr-attribute:');
      expect(renders).toBe(1);
      expect(decoder.decode((await reader.read()).value)).toContain(
        'data-askr-render-data="true"'
      );
      expect((await reader.read()).done).toBe(true);
    } finally {
      await reader.cancel();
    }
  });
});
