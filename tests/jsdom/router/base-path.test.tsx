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
import { isRoutePathActive } from '../../../src/router/activity';
import { navigate, updateRouteQuery } from '../../../src/router/navigate';
import {
  createRouteRegistry,
  currentRoute,
  route,
} from '../../../src/router/route';
import { renderRouteRequestToString } from '../../../src/ssr';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
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
        route('/reviews/{slug}', ({ slug }) => <h1>{slug}</h1>, {
          loader: () => {
            loads += 1;
            return { ready: true };
          },
        });
      },
      { basePath: '/website' }
    );
    const rendered = await renderRouteRequestToString({
      url: '/website/reviews/hydrated',
      registry,
    });
    if (rendered.kind !== 'render') throw new Error('expected render');
    container.innerHTML = rendered.html;
    window.history.replaceState({}, '', '/website/reviews/hydrated');

    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: false },
    });

    expect(container.querySelector('h1')?.textContent).toBe('hydrated');
    expect(loads).toBe(1);
  });
});
