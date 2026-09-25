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
  });
});
