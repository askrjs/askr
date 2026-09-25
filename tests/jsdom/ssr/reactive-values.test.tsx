import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import type { JSXElement } from '../../../src/jsx/types';
import { routeRegistryFromTable } from '../../router-test-utils';
import { cleanupApp, createSPA, hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import { ErrorBoundary } from '../../../src/components/error-boundary';
import { For, Show } from '../../../src/control';
import { defineScope, readScope } from '../../../src/runtime/context/context';
import { resource, task, watch } from '../../../src/resources';
import {
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { derive, state, type State } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type Page = () => JSXElement;

async function renderOnClient(Component: Page): Promise<string> {
  const { container, cleanup } = createTestContainer();
  try {
    await createSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
    });
    flushScheduler();
    return normalizeHtml(container.innerHTML);
  } finally {
    cleanupApp(container);
    cleanup();
  }
}

function normalizeHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html.replace(/<!--[\s\S]*?-->/g, '');
  return template.innerHTML;
}

function renderOnServer(Component: Page): string {
  return normalizeHtml(renderToStringSync(Component));
}

describe('SSR reactive values', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
  });

  async function hydrate(Component: Page): Promise<void> {
    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
      hydrate: { verifyMarkup: true },
    });
  }

  const cases: Array<[string, Page, string]> = [
    [
      'a function child',
      () => {
        const label = state('a<b & c');
        return <p>{() => label()}</p>;
      },
      '<p>a&lt;b &amp; c</p>',
    ],
    [
      'a state cell child',
      () => {
        const count = state(3);
        return <p>{count}</p>;
      },
      '<p>3</p>',
    ],
    [
      'a derived child',
      () => {
        const count = state(3);
        const doubled = derive(() => count() * 2);
        return <p>{doubled}</p>;
      },
      '<p>6</p>',
    ],
    [
      'a function child between static text',
      () => {
        const count = state(3);
        return <p>x {() => count()} y</p>;
      },
      '<p>x 3 y</p>',
    ],
    [
      'a function child returning elements',
      () => {
        const count = state(3);
        return (
          <div>
            <b>1</b>
            {() => <span>{count()}</span>}
            {() => [<i>a</i>, <i>b</i>]}
          </div>
        );
      },
      '<div><b>1</b><span>3</span><i>a</i><i>b</i></div>',
    ],
    [
      'function and state cell props',
      () => {
        const title = state('say "hi" <now>');
        const hidden = state(false);
        return (
          <p
            title={() => title()}
            class={() => 'lead'}
            data-count={state(2)}
            hidden={hidden}
          >
            {'z'}
          </p>
        );
      },
      '<p title="say &quot;hi&quot; &lt;now&gt;" class="lead" data-count="2">z</p>',
    ],
    [
      'a function child returning a state cell',
      () => {
        const useA = state(true);
        const a = state('A');
        return <p>{() => (useA() ? a : 'none')}</p>;
      },
      '<p>A</p>',
    ],
    [
      'a function child returning a state cell between siblings',
      () => {
        const a = state(5);
        return (
          <div>
            <b>1</b>
            {() => a}
          </div>
        );
      },
      '<div><b>1</b>5</div>',
    ],
    [
      'a function child returning a plain function',
      () => (
        <div>
          <p>{() => () => 'x'}</p>
          <b>1</b>
          {() => () => 'y'}
        </div>
      ),
      '<div><p></p><b>1</b></div>',
    ],
    [
      'a function child returning a fragment with a function child',
      () => (
        <div>
          <b>1</b>
          {() => (
            <>
              {'a'}
              {() => 'y'}
            </>
          )}
        </div>
      ),
      '<div><b>1</b>a</div>',
    ],
    [
      'a function child returning an element with a function child',
      () => {
        const label = state('q');
        return <div>{() => <i>{() => label()}</i>}</div>;
      },
      '<div><i>q</i></div>',
    ],
    [
      'a component returning a function or a state cell',
      () => {
        const count = state(5);
        const ReturnsFunction = (() => () => 'x') as unknown as () => null;
        const ReturnsCell = (() => count) as unknown as () => null;
        return (
          <p data-count={count}>
            <ReturnsFunction />
            <ReturnsCell />
          </p>
        );
      },
      '<p data-count="5"></p>',
    ],
    [
      'a function child in a component fragment',
      () => {
        const Only = () => <>{() => 'a'}</>;
        const WithText = () => (
          <>
            {'t'}
            {() => 'a'}
          </>
        );
        const WithElement = () => (
          <>
            <b>1</b>
            {() => 'a'}
          </>
        );
        return (
          <div>
            <section>
              <Only />
            </section>
            <section>
              <WithText />
            </section>
            <section>
              <WithElement />
            </section>
          </div>
        );
      },
      '<div><section>a</section><section>ta</section><section><b>1</b>a</section></div>',
    ],
    [
      'a function child passed through a layout fragment',
      () => {
        const Layout = (props: { children?: unknown }) => (
          <>
            <h1>{'h'}</h1>
            {props.children}
          </>
        );
        const Bare = (props: { children?: unknown }) => <>{props.children}</>;
        const label = state('S');
        return (
          <div>
            <Layout>{() => label()}</Layout>
            <Bare>{label}</Bare>
          </div>
        );
      },
      '<div><h1>h</h1>SS</div>',
    ],
    [
      'function and state cell items of a component array result',
      () => {
        const label = state('S');
        const Items = (() => [() => 'a', 'b', label]) as unknown as () => null;
        return (
          <div>
            <Items />
          </div>
        );
      },
      '<div>abS</div>',
    ],
    [
      'a function child of an ErrorBoundary',
      () => {
        const label = state('x');
        return (
          <div>
            <ErrorBoundary fallback={() => <em>{'fallback'}</em>}>
              {() => label()}
            </ErrorBoundary>
            <ErrorBoundary fallback={() => <em>{'fallback'}</em>}>
              {() => <b>{label()}</b>}
            </ErrorBoundary>
            <ErrorBoundary fallback={() => <em>{'fallback'}</em>}>
              {'t'}
            </ErrorBoundary>
          </div>
        );
      },
      '<div>x<b>x</b>t</div>',
    ],
    [
      'arrays that start with an item that renders nothing',
      () => (
        <div>
          <p>{() => [() => 'z', 'x']}</p>
          <p>{() => [{} as never, 'x']}</p>
          <p>{[{} as never, 'x']}</p>
          <p>{() => [<b>1</b>, {} as never, 'x']}</p>
          <script>{() => [() => 'z', 'var a = 1;']}</script>
        </div>
      ),
      '<div><p>x</p><p>x</p><p>x</p><p><b>1</b>x</p><script>var a = 1;</script></div>',
    ],
  ];

  it.each(cases)(
    'should render %s on the server as the client does',
    async (_name, Component, expected) => {
      expect(renderToStringSync(Component)).toContain(expected);
      expect(renderOnServer(Component)).toBe(normalizeHtml(expected));
      expect(await renderOnClient(Component)).toBe(normalizeHtml(expected));
    }
  );

  it.each(cases)(
    'should hydrate %s with verified markup',
    async (_name, Component, expected) => {
      container.innerHTML = renderToStringSync(Component);
      const serverRoot = container.firstElementChild;
      const serverText = container.textContent;
      await hydrate(Component);
      expect(container.firstElementChild).toBe(serverRoot);
      expect(container.textContent).toBe(serverText);
      expect(normalizeHtml(container.innerHTML)).toBe(normalizeHtml(expected));
    }
  );

  it('should keep hydrated function children and props reactive', async () => {
    let label!: State<string>;
    const Component = () => {
      label = state('before');
      return <p title={() => label()}>{() => label()}</p>;
    };

    container.innerHTML = renderToStringSync(Component);
    await hydrate(Component);
    label.set('after');
    flushScheduler();

    const p = container.querySelector('p')!;
    expect(p.textContent).toBe('after');
    expect(p.getAttribute('title')).toBe('after');
  });

  it('should follow the state cell a hydrated function child returns', async () => {
    let useA!: State<boolean>;
    let b!: State<string>;
    const Component = () => {
      useA = state(true);
      const a = state('A');
      b = state('B');
      return <p data-b={b}>{() => (useA() ? a : b)}</p>;
    };

    container.innerHTML = renderToStringSync(Component);
    await hydrate(Component);
    useA.set(false);
    flushScheduler();
    expect(container.querySelector('p')!.textContent).toBe('B');

    b.set('B2');
    flushScheduler();
    expect(container.querySelector('p')!.textContent).toBe('B2');
  });

  it('should keep an element returned by a hydrated function child reactive', async () => {
    let label!: State<string>;
    const Component = () => {
      label = state('q');
      return <div>{() => <i>{() => label()}</i>}</div>;
    };

    container.innerHTML = renderToStringSync(Component);
    const serverItalic = container.querySelector('i');
    await hydrate(Component);
    expect(container.querySelector('i')).toBe(serverItalic);

    label.set('r');
    flushScheduler();
    expect(container.querySelector('i')!.textContent).toBe('r');
  });

  it('should keep function children in component fragments reactive after hydration', async () => {
    let label!: State<string>;
    const Layout = (props: { children?: unknown }) => (
      <>
        <h1>{'h'}</h1>
        {props.children}
      </>
    );
    const Component = () => {
      label = state('before');
      return (
        <div>
          <Layout>{() => label()}</Layout>
          <ErrorBoundary fallback={() => <em>{'fallback'}</em>}>
            {() => <b>{label()}</b>}
          </ErrorBoundary>
        </div>
      );
    };

    container.innerHTML = renderToStringSync(Component);
    const serverRoot = container.firstElementChild;
    await hydrate(Component);
    expect(container.firstElementChild).toBe(serverRoot);
    expect(container.textContent).toBe('hbeforebefore');

    label.set('after');
    flushScheduler();
    expect(normalizeHtml(container.innerHTML)).toBe(
      '<div><h1>h</h1>after<b>after</b></div>'
    );
  });

  it('should render a function child at the top of a page fragment', async () => {
    const Page = () => (
      <>
        {() => 'a'}
        <b>{'1'}</b>
      </>
    );

    expect(renderOnServer(Page)).toBe('a<b>1</b>');
    expect(await renderOnClient(Page)).toBe('a<b>1</b>');

    container.innerHTML = renderToStringSync(Page);
    await hydrate(Page);
    expect(normalizeHtml(container.innerHTML)).toBe('a<b>1</b>');
  });

  it('should evaluate each function child and prop once on the server', () => {
    let childReads = 0;
    let propReads = 0;
    const html = renderToStringSync(() => (
      <p
        title={() => {
          propReads += 1;
          return 't';
        }}
        style={() => ({ color: 'red' })}
      >
        {() => {
          childReads += 1;
          return 'c';
        }}
      </p>
    ));

    expect(html).toContain('<p title="t" style="color:red;">c</p>');
    expect(childReads).toBe(1);
    expect(propReads).toBe(1);
  });

  it('should render function children of raw text elements', () => {
    const css = '.a > .b { color: red }';
    const html = renderToStringSync(() => {
      const rule = state('.c { color: blue }');
      return (
        <style>
          {() => css}
          {() => rule}
          {() => () => 'ignored'}
        </style>
      );
    });

    expect(html).toContain(`<style>${css}.c { color: blue }</style>`);
  });

  it('should read a reactive annotation-xml encoding once', () => {
    let reads = 0;
    const html = renderToStringSync(() => (
      <math>
        <annotation-xml
          encoding={() => {
            reads += 1;
            return 'text/html';
          }}
        >
          <style>{'a > b {}'}</style>
        </annotation-xml>
      </math>
    ));

    expect(reads).toBe(1);
    expect(html).toContain(
      '<annotation-xml encoding="text/html"><style>a > b {}</style></annotation-xml>'
    );
  });

  describe('errors', () => {
    const fail = (): never => {
      throw new Error('boom');
    };
    const fallback = () => <em>{'fallback'}</em>;

    const boundaryCases: Array<[string, Page]> = [
      [
        'a throwing direct function child',
        () => (
          <div>
            <ErrorBoundary fallback={fallback}>{fail}</ErrorBoundary>
          </div>
        ),
      ],
      [
        'a throwing function child',
        () => (
          <div>
            <ErrorBoundary fallback={fallback}>
              <p>{fail}</p>
            </ErrorBoundary>
          </div>
        ),
      ],
      [
        'a throwing function child in a nested component',
        () => {
          const Child = () => (
            <p>
              <b>1</b>
              {fail}
            </p>
          );
          return (
            <div>
              <ErrorBoundary fallback={fallback}>
                <Child />
              </ErrorBoundary>
            </div>
          );
        },
      ],
      [
        'a throwing function prop',
        () => (
          <div>
            <ErrorBoundary fallback={fallback}>
              <p title={fail}>{'t'}</p>
            </ErrorBoundary>
          </div>
        ),
      ],
    ];

    it.each(boundaryCases)(
      'should render the ErrorBoundary fallback for %s on both sides',
      async (_name, Component) => {
        const expected = '<div><em>fallback</em></div>';
        expect(renderOnServer(Component)).toBe(expected);
        expect(await renderOnClient(Component)).toBe(expected);

        container.innerHTML = renderToStringSync(Component);
        const serverRoot = container.firstElementChild;
        await hydrate(Component);
        expect(container.firstElementChild).toBe(serverRoot);
        expect(normalizeHtml(container.innerHTML)).toBe(expected);
      }
    );

    it.each([
      ['a throwing function child', () => <p>{fail}</p>],
      ['a throwing function prop', () => <p title={fail}>{'t'}</p>],
    ] as Array<[string, Page]>)(
      'should throw %s without a boundary on both sides',
      async (_name, Component) => {
        expect(() => renderToStringSync(Component)).toThrow('boom');
        await expect(renderOnClient(Component)).rejects.toThrow('boom');
      }
    );

    it('should route a hydrated function child that starts throwing to its ErrorBoundary', async () => {
      let broken!: State<boolean>;
      const onError = vi.fn();
      const Child = () => {
        broken = state(false);
        return (
          <p>
            {() => {
              if (broken()) throw new Error('child failed');
              return 'ok';
            }}
          </p>
        );
      };
      const Component = () => (
        <div>
          <ErrorBoundary fallback={fallback} onError={onError}>
            <Child />
          </ErrorBoundary>
        </div>
      );

      container.innerHTML = renderToStringSync(Component);
      await hydrate(Component);
      expect(container.querySelector('p')!.textContent).toBe('ok');

      broken.set(true);
      flushScheduler();

      expect(onError).toHaveBeenCalledTimes(1);
      expect((onError.mock.calls[0][0] as Error).message).toBe('child failed');
      expect(container.querySelector('em')?.textContent).toBe('fallback');
    });

    it('should route a direct ErrorBoundary function child that starts throwing to it', async () => {
      let broken!: State<boolean>;
      const onError = vi.fn();
      const Component = () => {
        broken = state(false);
        return (
          <div>
            <ErrorBoundary fallback={fallback} onError={onError}>
              {() => {
                if (broken()) throw new Error('direct failed');
                return 'ok';
              }}
            </ErrorBoundary>
          </div>
        );
      };

      container.innerHTML = renderToStringSync(Component);
      await hydrate(Component);
      expect(container.textContent).toBe('ok');

      broken.set(true);
      flushScheduler();

      expect(onError).toHaveBeenCalledTimes(1);
      expect((onError.mock.calls[0][0] as Error).message).toBe('direct failed');
      expect(normalizeHtml(container.innerHTML)).toBe(
        '<div><em>fallback</em></div>'
      );
    });
  });

  describe('function children as components', () => {
    const Theme = defineScope('light');
    const bodies: Record<string, () => unknown> = {
      Show: () => <Show when={() => true}>{'shown'}</Show>,
      For: () => (
        <For each={() => ['a', 'b']} by={(item: string) => item}>
          {(item: string) => <i>{item}</i>}
        </For>
      ),
      readScope: () => readScope(Theme),
      'state()': () => {
        const [value] = state('stateful');
        return value();
      },
    };
    const positions: Record<string, (child: () => unknown) => Page> = {
      'an element': (child) => () => (
        <Theme value={'dark'}>
          <div>{child}</div>
        </Theme>
      ),
      'an element with siblings': (child) => () => (
        <Theme value={'dark'}>
          <div>
            <b>{'1'}</b>
            {child}
          </div>
        </Theme>
      ),
      'a component fragment': (child) => {
        const Layout = (props: { children?: unknown }) => <>{props.children}</>;
        return () => (
          <Theme value={'dark'}>
            <div>
              <Layout>{child}</Layout>
            </div>
          </Theme>
        );
      },
      'an ErrorBoundary': (child) => () => (
        <Theme value={'dark'}>
          <div>
            <ErrorBoundary fallback={() => <em>{'fallback'}</em>}>
              {child}
            </ErrorBoundary>
          </div>
        </Theme>
      ),
    };
    const expectedText: Record<string, string> = {
      Show: 'shown',
      For: 'ab',
      readScope: 'dark',
      'state()': 'stateful',
    };

    const matrix: Array<[string, string, Page, string]> = [];
    for (const [body, child] of Object.entries(bodies)) {
      for (const [position, place] of Object.entries(positions)) {
        matrix.push([body, position, place(child), expectedText[body]!]);
      }
    }

    it.each(matrix)(
      'should render %s in %s the same on server, client and hydration',
      async (_body, position, Component, text) => {
        const server = renderOnServer(Component);
        const expectedServerText =
          position === 'an element with siblings' ? `1${text}` : text;
        const serverContainer = document.createElement('div');
        serverContainer.innerHTML = server;
        expect(serverContainer.textContent).toBe(expectedServerText);
        expect(await renderOnClient(Component)).toBe(server);

        container.innerHTML = renderToStringSync(Component);
        const serverRoot = container.firstElementChild;
        await hydrate(Component);
        expect(container.firstElementChild).toBe(serverRoot);
        expect(normalizeHtml(container.innerHTML)).toBe(server);
      }
    );

    it('should keep Show and state() in an element function child reactive after hydration', async () => {
      let visible!: State<boolean>;
      let bump!: () => void;
      const Component = () => {
        visible = state(true);
        return (
          <div>
            {() => (
              <Show when={visible} fallback={<em>{'hidden'}</em>}>
                {'shown'}
              </Show>
            )}
            <p>
              {() => {
                const [count, setCount] = state(0);
                bump = () => setCount((value) => value + 1);
                return count();
              }}
            </p>
          </div>
        );
      };

      container.innerHTML = renderToStringSync(Component);
      await hydrate(Component);
      expect(normalizeHtml(container.innerHTML)).toBe(
        '<div>shown<p>0</p></div>'
      );

      visible.set(false);
      bump();
      flushScheduler();
      expect(normalizeHtml(container.innerHTML)).toBe(
        '<div><em>hidden</em><p>1</p></div>'
      );
    });
  });

  describe('element function children that need a component', () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const Layout = (props: { children?: unknown }) => <>{props.children}</>;

    async function mount(Component: Page): Promise<HTMLElement> {
      await createSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
      });
      flushScheduler();
      return container;
    }

    it('should run task() and resource() in element and fragment positions alike', async () => {
      const ran: string[] = [];
      const cleaned: string[] = [];
      const body = (tag: string) => () => {
        task(() => {
          ran.push(tag);
          return () => cleaned.push(tag);
        });
        const loaded = resource(async () => `${tag}-loaded`, []);
        return loaded.pending ? `${tag}-pending` : String(loaded.value);
      };
      const elementBody = body('element');
      const fragmentBody = body('fragment');
      const Component = () => (
        <div>
          <p>{elementBody}</p>
          <Layout>{fragmentBody}</Layout>
        </div>
      );

      await mount(Component);
      await tick();
      flushScheduler();
      await tick();
      flushScheduler();

      expect(ran.sort()).toEqual(['element', 'fragment']);
      expect(normalizeHtml(container.innerHTML)).toBe(
        '<div><p>element-loaded</p>fragment-loaded</div>'
      );
      cleanupApp(container);
      expect(cleaned.sort()).toEqual(['element', 'fragment']);
    });

    it('should upgrade when a later run first uses a hook, and keep its state', async () => {
      let enabled!: State<boolean>;
      let inner!: State<string>;
      const seen: number[] = [];
      const Component = () => {
        enabled = state(false);
        const count = state(0);
        return (
          <div>
            {() => {
              if (!enabled()) return 'none';
              inner = state('v0');
              watch(
                () => count(),
                (value: number) => {
                  seen.push(value);
                }
              );
              return inner();
            }}
          </div>
        );
      };

      await mount(Component);
      expect(container.textContent).toBe('none');

      enabled.set(true);
      flushScheduler();
      await tick();
      flushScheduler();
      expect(container.textContent).toBe('v0');

      inner.set('v1');
      flushScheduler();
      expect(container.textContent).toBe('v1');
      expect(seen).toEqual([0]);
    });

    it.each([
      ['an element', (child: () => unknown) => <div>{child}</div>],
      [
        'a component fragment',
        (child: () => unknown) => (
          <div>
            <Layout>{child}</Layout>
          </div>
        ),
      ],
    ] as Array<[string, (child: () => unknown) => JSXElement]>)(
      'should report a changed hook order in %s',
      async (_position, place) => {
        let useState!: State<boolean>;
        const Component = () => {
          useState = state(true);
          return place(() => {
            if (useState()) {
              const [value] = state('st');
              return value();
            }
            return (
              <For each={() => ['x']} by={(item: string) => item}>
                {(item: string) => <i>{item}</i>}
              </For>
            );
          });
        };

        await mount(Component);
        expect(container.textContent).toBe('st');
        expect(() => {
          useState.set(false);
          flushScheduler();
        }).toThrow(/Hook order violation/);
      }
    );
  });

  describe('parent re-renders', () => {
    const Layout = (props: { children?: unknown }) => <>{props.children}</>;
    const shapes: Array<
      [string, (n: number, read: () => string) => JSXElement, string]
    > = [
      [
        'a function child of the root element',
        (n, read) => <div data-n={n}>{() => read()}</div>,
        '<div data-n="N">V</div>',
      ],
      [
        'a function child beside an element in the root element',
        (n, read) => (
          <div data-n={n}>
            <b>{'b'}</b>
            {() => read()}
          </div>
        ),
        '<div data-n="N"><b>b</b>V</div>',
      ],
      [
        'a function child in a fragment in the root element',
        (n, read) => (
          <div data-n={n}>
            <Layout>{() => read()}</Layout>
          </div>
        ),
        '<div data-n="N">V</div>',
      ],
      [
        'a hook-using function child of the root element',
        (n, read) => (
          <div data-n={n}>
            {() => {
              const [suffix] = state('!');
              return read() + suffix();
            }}
          </div>
        ),
        '<div data-n="N">V!</div>',
      ],
    ];

    it.each(shapes)(
      'should keep %s across a parent re-render',
      async (_name, shape, template) => {
        let parent!: State<number>;
        let value!: State<string>;
        const Component = () => {
          parent = state(0);
          value = state('O');
          return shape(parent(), () => value());
        };
        const expected = (n: number, v: string) =>
          template.replace('N', String(n)).replace('V', v);

        await createSPA({
          root: container,
          registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
        });
        flushScheduler();
        expect(normalizeHtml(container.innerHTML)).toBe(expected(0, 'O'));

        parent.set(1);
        flushScheduler();
        expect(normalizeHtml(container.innerHTML)).toBe(expected(1, 'O'));

        value.set('Z');
        flushScheduler();
        expect(normalizeHtml(container.innerHTML)).toBe(expected(1, 'Z'));
      }
    );
  });

  describe('providers and portals', () => {
    const A = defineScope('a0');

    it('should read a provider rendered by a wrapper around the function child', async () => {
      const Wrapper = (props: { children?: unknown }) => (
        <A value={'w'}>
          <>{props.children}</>
        </A>
      );
      const Reader = () => <>{readScope(A)}</>;
      const withFunction = () => (
        <section>
          <A value={'outer'}>
            <Wrapper>{() => readScope(A)}</Wrapper>
          </A>
        </section>
      );
      const withComponent = () => (
        <section>
          <A value={'outer'}>
            <Wrapper>
              <Reader />
            </Wrapper>
          </A>
        </section>
      );

      for (const Component of [withFunction, withComponent]) {
        const serverContainer = document.createElement('div');
        serverContainer.innerHTML = renderToStringSync(Component);
        expect(serverContainer.textContent).toBe('w');
        const { container: client, cleanup: cleanupClient } =
          createTestContainer();
        await createSPA({
          root: client,
          registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
        });
        flushScheduler();
        expect(client.textContent).toBe('w');
        cleanupApp(client);
        cleanupClient();
      }
    });

    it('should render a function child of Portal on both sides', async () => {
      const Component = () => (
        <main>
          <A value={'p'}>
            <Portal>{() => readScope(A)}</Portal>
          </A>
        </main>
      );

      _resetDefaultPortal();
      const serverContainer = document.createElement('div');
      serverContainer.innerHTML = renderToStringSync(Component);
      expect(serverContainer.textContent).toBe('p');

      _resetDefaultPortal();
      await createSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
      });
      flushScheduler();
      expect(container.textContent).toBe('p');
    });
  });
});
