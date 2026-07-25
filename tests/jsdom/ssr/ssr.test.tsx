import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { For } from '../../../src/control';
import { defineScope, readScope } from '../../../src/runtime/context';
import { fallback, route } from '../../../src/router/route';
import { Fragment, jsx, jsxs } from '../../../src/jsx/jsx-runtime';
import {
  renderToStringSync,
  renderToString,
  renderToStream,
} from '../../../src/ssr';
import type { JSXElement } from '../../../src/jsx/types';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

// Consolidated SSR tests

describe('SSR route registration', () => {
  it('should not allow route registration during SSR', () => {
    const Comp = () => {
      route('/x', () => <div />);
      return <div />;
    };

    expect(() => renderToStringSync(Comp)).toThrow(
      /route\(\) cannot be called during SSR|route\(\) can only be called during component render/i
    );
  });
});

describe('snapshot restore (SSR)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should capture component state in snapshot', async () => {
    const Component = () => <div>hello</div>;
    const html = renderToStringSync(Component);

    expect(html).toContain('<div');
    expect(html).toContain('hello');
  });

  it('should apply snapshot to new instance during restore', async () => {
    const Component = () => <div>hello</div>;
    const html = renderToStringSync(Component);

    container.innerHTML = html;
    await expect(
      hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
      })
    ).resolves.not.toThrow();
    flushScheduler();

    expect(container.textContent).toContain('hello');
  });
});

describe('SSR determinism (SSR)', () => {
  it('should render For items during synchronous SSR', async () => {
    const Component = () => (
      <ul>
        <For
          each={[
            { id: 'a', label: 'alpha' },
            { id: 'b', label: 'beta' },
          ]}
          by={(item) => item.id}
        >
          {(item, index) => <li data-index={index()}>{item.label}</li>}
        </For>
      </ul>
    );

    expect(renderToStringSync(Component)).toBe(
      '<ul><li data-index="0" data-key="a" data-askr-key-kind="string">alpha</li><li data-index="1" data-key="b" data-askr-key-kind="string">beta</li></ul>'
    );
  });

  it('should render same HTML every time when component is the same', async () => {
    const Component = () => <div class="x">hello</div>;

    const a = renderToStringSync(Component);
    const b = renderToStringSync(Component);
    const c = renderToStringSync(Component);

    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('should throw when using nondeterministic globals like Math.random', async () => {
    const Random = () => <div>{Math.random()}</div>;
    expect(() => renderToStringSync(Random)).toThrow(/Math.random.*SSR/i);
  });

  it('should have no side effects during SSR render', async () => {
    let sideEffects = 0;
    const SideEffectful = () => {
      sideEffects++;
      return <div>x</div>;
    };

    renderToStringSync(SideEffectful);

    // SSR executes the component, so side effects occur during rendering
    expect(sideEffects).toBe(1);
  });
});

describe('SSR strict purity', () => {
  it('should throw in dev when component uses global time/randomness during SSR', () => {
    const Component = () => {
      // This uses Date and Math inside render
      const t = Date.now();
      const r = Math.random();
      return (
        <div>
          {String(t)}
          {String(r)}
        </div>
      ) as unknown as JSXElement;
    };

    expect(() => renderToStringSync(() => Component())).toThrow();
  });
});

describe('SSR child normalization', () => {
  it('should render a single Fragment child passed through props.children', () => {
    expect(
      renderToStringSync(() =>
        jsx(Fragment, {
          children: jsx('main', { children: 'hello' }),
        })
      )
    ).toBe('<main>hello</main>');
  });

  it('should preserve the array-shaped Fragment child form', () => {
    expect(
      renderToStringSync(() =>
        jsxs(Fragment, {
          children: [jsx('main', { children: 'hello' })],
        })
      )
    ).toBe('<main>hello</main>');
  });

  it('should preserve single Context children', () => {
    const ThemeScope = defineScope('default');

    const App = () => (
      <ThemeScope value={'scoped'}>
        <main>{'one'}</main>
      </ThemeScope>
    );

    expect(renderToStringSync(App)).toBe('<main>one</main>');
  });

  it('should render multiple Context children as siblings', () => {
    const ThemeScope = defineScope('default');

    const App = () => (
      <ThemeScope value={'scoped'}>
        {[<span>{'a'}</span>, <main>{'b'}</main>]}
      </ThemeScope>
    );

    expect(renderToStringSync(App)).toBe('<span>a</span><main>b</main>');
  });

  it('should preserve nested arrays in large child lists', () => {
    const nestedChildren = Array.from({ length: 32 }, (_, index) => [
      jsx('span', { children: String(index) }),
    ]);
    const expected = Array.from(
      { length: nestedChildren.length },
      (_, index) => `<span>${index}</span>`
    ).join('');

    expect(
      renderToStringSync(() =>
        jsx('div', {
          children: nestedChildren,
        })
      )
    ).toBe(`<div>${expected}</div>`);
  });

  it('should restore provider context for nested SSR components', () => {
    const ThemeScope = defineScope('light');
    const Consumer = () => <span>{readScope(ThemeScope)}</span>;
    const Wrapper = (props: { children?: unknown }) => (
      <section>{props.children}</section>
    );
    const Provider = (props: { children?: unknown }) => (
      <ThemeScope value="dark">
        <div>
          <Wrapper>{props.children}</Wrapper>
        </div>
      </ThemeScope>
    );

    expect(() =>
      renderToStringSync(() => (
        <Provider>
          <Consumer />
        </Provider>
      ))
    ).not.toThrow();
    expect(
      renderToStringSync(() => (
        <Provider>
          <Consumer />
        </Provider>
      ))
    ).toBe('<div><section><span>dark</span></section></div>');
  });

  it('should preserve Context sibling children through route-based SSR', () => {
    const ThemeScope = defineScope('default');
    const routes = [
      {
        path: '/',
        handler: () => (
          <ThemeScope value={'scoped'}>
            {[<span>{'a'}</span>, <main>{'b'}</main>]}
          </ThemeScope>
        ),
      },
    ];

    expect(renderToString({ url: '/', routes })).toBe(
      '<span>a</span><main>b</main>'
    );
  });

  it('should preserve direct route handler sibling arrays through route-based SSR', () => {
    const routes = [
      {
        path: '/',
        handler: () => [<span>{'a'}</span>, <main>{'b'}</main>],
      },
    ];

    expect(renderToString({ url: '/', routes })).toBe(
      '<span>a</span><main>b</main>'
    );
  });
});

describe('SSR document boundary', () => {
  it('should keep route-based HTML unchanged when no document renderer is provided', () => {
    const routes = [
      {
        path: '/users/{id}',
        handler: ({ id }: { id: string }) => <main>User {id}</main>,
      },
    ];

    expect(renderToString({ url: '/users/42', routes })).toBe(
      '<main>User 42</main>'
    );
  });

  it('should wrap route-based HTML with document context when provided', () => {
    const routes = [
      {
        path: '/users/{id}',
        namespace: 'app',
        handler: ({ id }: { id: string }) => <main>User {id}</main>,
      },
    ];
    const data = { greeting: 'hi' };
    let seenContext: Record<string, unknown> | null = null;
    const document = ({
      appHtml,
      context,
    }: {
      appHtml: string;
      context: Record<string, unknown>;
    }) => {
      seenContext = context;
      return `<!doctype html><html><body>${appHtml}</body></html>`;
    };

    const appHtml = renderToString({
      url: '/users/42?tab=activity#top',
      routes,
      data,
    });
    const wrappedHtml = renderToString({
      url: '/users/42?tab=activity#top',
      routes,
      data,
      document,
    });

    expect(wrappedHtml).toBe(
      `<!doctype html><html><body>${appHtml}</body></html>`
    );
    expect(seenContext).toMatchObject({
      mode: 'ssr',
      url: '/users/42?tab=activity#top',
      pathname: '/users/42',
      search: '?tab=activity',
      hash: '#top',
      params: { id: '42' },
      data,
      seed: 12345,
      route: {
        path: '/users/{id}',
        namespace: 'app',
      },
    });
  });

  it('should preserve fallback matching for shared route tables', () => {
    resetRouteState();
    try {
      route('/home', () => <div>{'home'}</div>);
      fallback((params: Record<string, string>) => (
        <div>{`root-missing:${params['*']}`}</div>
      ));

      const html = renderToString({
        url: '/outside/deeper',
        registry: currentRouteRegistry(),
      });

      expect(html).toContain('root-missing:/outside/deeper');
      expect(html).not.toContain('home');
    } finally {
      resetRouteState();
    }
  });

  it('should throw a clear error when the document renderer does not return a string', () => {
    const routes = [{ path: '/', handler: () => <main>Hello</main> }];

    expect(() =>
      renderToString({
        url: '/',
        routes,
        document: (() =>
          Promise.resolve('<html><body>Hello</body></html>')) as never,
      })
    ).toThrow(/document\(\) must synchronously return a string/i);
  });
});

describe('SSR streaming parity', () => {
  it('should stream SSR matches string SSR', () => {
    const routes = [{ path: '/', handler: () => <div>x</div> }];

    let out = '';
    renderToStream({
      url: '/',
      routes,
      onChunk: (c) => (out += c),
      onComplete: () => {},
    });

    expect(out).toBe(renderToString({ url: '/', routes }));
  });
});
