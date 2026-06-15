import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { For } from '../../../src/control';
import {
  clearRoutes,
  fallback,
  getRoutes,
  route,
} from '../../../src/router/route';
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
        routes: [{ path: '/', handler: Component }],
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
      '<ul><li data-index="0" data-key="a">alpha</li><li data-index="1" data-key="b">beta</li></ul>'
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
    clearRoutes();
    try {
      route('/home', () => <div>{'home'}</div>);
      fallback((params: Record<string, string>) => (
        <div>{`root-missing:${params['*']}`}</div>
      ));

      const html = renderToString({
        url: '/outside/deeper',
        routes: getRoutes(),
      });

      expect(html).toContain('root-missing:/outside/deeper');
      expect(html).not.toContain('home');
    } finally {
      clearRoutes();
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
