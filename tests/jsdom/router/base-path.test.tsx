import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { createSPA, hydrateSPA } from '../../../src/boot';
import { Link } from '../../../src/components/link';
import { state } from '../../../src/runtime/state';
import { isRoutePathActive } from '../../../src/router/activity';
import { navigate, updateRouteQuery } from '../../../src/router/navigate';
import {
  createRouteRegistry,
  currentRoute,
  route,
} from '../../../src/router/route';
import { renderRouteRequestToString } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { resetRouteState } from '../../router-test-utils';

describe('client route base paths', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
  });

  afterEach(() => cleanup());

  it('should keep links, navigation, queries, popstate, activity, and metadata aligned', async () => {
    let loaderPathname = '';
    let metadataPathname = '';
    const registry = createRouteRegistry(
      () => {
        route('/', () => (
          <main data-active={String(isRoutePathActive('/'))}>
            <Link href="/reviews/book">Review</Link>
          </main>
        ));
        route(
          '/reviews/{slug}',
          () => {
            const snapshot = currentRoute<{ slug: string }>();
            return (
              <p data-path={snapshot.path} data-slug={snapshot.params.slug}>
                {snapshot.query.get('view') ?? 'review'}
              </p>
            );
          },
          {
            loader: (context) => {
              loaderPathname = context.pathname;
              return context.params.slug;
            },
            meta: (context) => {
              metadataPathname = context.pathname;
              return { title: context.params.slug };
            },
          }
        );
      },
      { basePath: '/website/' }
    );
    window.history.replaceState({}, '', '/website/');

    await createSPA({ root: container, registry });
    expect(container.querySelector('main')?.dataset.active).toBe('true');
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      '/website/reviews/book'
    );

    navigate('/reviews/book?view=full');
    await vi.waitFor(() =>
      expect(container.querySelector('p')?.textContent).toBe('full')
    );
    expect(window.location.pathname).toBe('/website/reviews/book');
    expect(loaderPathname).toBe('/reviews/book');
    expect(metadataPathname).toBe('/reviews/book');
    expect(container.querySelector('p')?.dataset.path).toBe('/reviews/book');
    expect(container.querySelector('p')?.dataset.slug).toBe('book');

    updateRouteQuery({ view: 'compact' });
    expect(window.location.pathname).toBe('/website/reviews/book');
    expect(window.location.search).toBe('?view=compact');

    window.history.replaceState({}, '', '/website/reviews/popped?view=history');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await vi.waitFor(() =>
      expect(container.querySelector('p')?.dataset.slug).toBe('popped')
    );
    expect(container.querySelector('p')?.dataset.path).toBe('/reviews/popped');
  });

  it('should hydrate a mounted page without rerunning its loader', async () => {
    let loads = 0;
    const registry = createRouteRegistry(
      () => {
        route(
          '/reviews/{slug}',
          ({ slug }) => {
            const count = state(0);
            return (
              <button onClick={() => count.set((value) => value + 1)}>
                {`${slug}:${String(count())}`}
              </button>
            );
          },
          {
            loader: () => {
              loads += 1;
              return { ready: true };
            },
          }
        );
      },
      { basePath: '/website' }
    );
    const rendered = await renderRouteRequestToString({
      url: '/website/reviews/hydrated',
      registry,
    });
    if (rendered.kind !== 'render') throw new Error('expected render');
    container.innerHTML = rendered.html;
    const button = container.querySelector('button') as HTMLButtonElement;
    window.history.replaceState({}, '', '/website/reviews/hydrated');

    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    });

    expect(container.querySelector('button')).toBe(button);
    expect(button.textContent).toBe('hydrated:0');
    expect(loads).toBe(1);

    button.click();
    flushScheduler();

    expect(container.querySelector('button')).toBe(button);
    expect(button.textContent).toBe('hydrated:1');
  });

  it('should verify static mounted markup before applying a deep-link query', async () => {
    const registry = createRouteRegistry(
      () => {
        route('/search', () => {
          const snapshot = currentRoute();
          return (
            <p>{`${snapshot.query.get('q') ?? ''}|${snapshot.query.get('page') ?? '1'}|${snapshot.hash ?? ''}`}</p>
          );
        });
      },
      { basePath: '/website' }
    );
    const rendered = await renderRouteRequestToString({
      url: '/website/search/',
      registry,
    });
    if (rendered.kind !== 'render') throw new Error('expected render');
    container.innerHTML = rendered.html;
    const paragraph = container.querySelector('p');
    expect(paragraph?.textContent).toBe('|1|');
    window.history.replaceState(
      {},
      '',
      '/website/search/?q=pig&page=2#results'
    );

    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    });

    expect(container.querySelector('p')).toBe(paragraph);
    expect(paragraph?.textContent).toBe('pig|2|#results');
  });

  it('should reject changed server markup for a query-rendered mounted page', async () => {
    const registry = createRouteRegistry(
      () => {
        route('/search', () => (
          <p>{currentRoute().query.get('q') ?? 'missing'}</p>
        ));
      },
      { basePath: '/website' }
    );
    const url = '/website/search/?q=server';
    const rendered = await renderRouteRequestToString({ url, registry });
    if (rendered.kind !== 'render') throw new Error('expected render');
    container.innerHTML = rendered.html;
    container.querySelector('p')!.textContent = 'changed';
    window.history.replaceState({}, '', url);

    await expect(
      hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      })
    ).rejects.toThrow('Hydration mismatch detected');
  });

  it('should not treat physical paths outside the mount as logical routes', async () => {
    const registry = createRouteRegistry(
      () => {
        route('/', () => <main>Home</main>);
        route('/outside', () => <main>Logical outside</main>);
      },
      { basePath: '/website' }
    );
    window.history.replaceState({}, '', '/website/');
    await createSPA({ root: container, registry });

    window.history.replaceState({}, '', '/outside');

    expect(isRoutePathActive('/outside')).toBe(false);
  });
});
