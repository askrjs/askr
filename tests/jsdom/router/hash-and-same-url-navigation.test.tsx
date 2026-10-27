import { resetRouteState } from '../../router-test-utils';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

async function settle() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
    flushScheduler();
  }
}

/**
 * A navigation that only changes the fragment stays on the current page: no
 * loader runs and the rendered content keeps its identity. A navigation to
 * the current location replaces the history entry instead of stacking a
 * duplicate.
 */
describe('hash-only and same-location navigation', () => {
  let { container, cleanup } = createTestContainer();
  let loads = 0;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    loads = 0;
    window.history.replaceState({}, '', '/docs');
  });
  afterEach(() => cleanup());

  function registry() {
    return createRouteRegistry(() => {
      route(
        '/docs',
        () => (
          <article>
            <h1>docs</h1>
            <p id="intro">intro</p>
          </article>
        ),
        {
          loader: async () => {
            loads += 1;
            return { ok: true };
          },
        }
      );
    });
  }

  it('should change only the fragment without rerunning the loader', async () => {
    await createSPA({ root: container, registry: registry() });
    await settle();
    const article = container.querySelector('article')!;
    expect(loads).toBe(1);
    const length = window.history.length;

    navigate('/docs#intro');
    await settle();

    expect(window.location.hash).toBe('#intro');
    expect(loads).toBe(1);
    expect(container.querySelector('article')).toBe(article);
    expect(window.history.length).toBe(length + 1);
  });

  it('should traverse fragment-only history entries without rerunning the loader', async () => {
    await createSPA({ root: container, registry: registry() });
    await settle();
    const article = container.querySelector('article')!;
    navigate('/docs#intro');
    await settle();
    expect(loads).toBe(1);

    // Back to /docs, then forward to /docs#intro, as the browser fires them.
    window.history.replaceState(window.history.state, '', '/docs');
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: { path: '/docs' } })
    );
    await settle();
    expect(window.location.hash).toBe('');
    expect(loads).toBe(1);
    expect(container.querySelector('article')).toBe(article);

    window.history.replaceState(window.history.state, '', '/docs#intro');
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: { path: '/docs#intro' } })
    );
    await settle();
    expect(window.location.hash).toBe('#intro');
    expect(loads).toBe(1);
    expect(container.querySelector('article')).toBe(article);
  });

  it('should save and restore scroll across fragment-only traversal', async () => {
    const scrollToSpy = vi.fn();
    for (const [name, value] of [
      ['scrollTo', scrollToSpy],
      ['scrollX', 0],
      ['scrollY', 0],
    ] as const) {
      Object.defineProperty(window, name, {
        value,
        writable: true,
        configurable: true,
      });
    }
    await createSPA({ root: container, registry: registry() });
    await settle();
    navigate('/docs#intro');
    await settle();
    window.scrollY = 300;

    // Back to /docs: the fragment entry's offset is saved on the way out.
    window.history.replaceState(window.history.state, '', '/docs');
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: { path: '/docs' } })
    );
    await settle();
    scrollToSpy.mockClear();

    // Forward to /docs#intro restores it.
    window.history.replaceState(window.history.state, '', '/docs#intro');
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: { path: '/docs#intro' } })
    );
    await settle();
    expect(scrollToSpy).toHaveBeenCalledWith(0, 300);
    expect(loads).toBe(1);
  });

  it('should scroll to the fragment, not the top, for a native anchor entry', async () => {
    const scrollToSpy = vi.fn();
    Object.defineProperty(window, 'scrollTo', {
      value: scrollToSpy,
      writable: true,
      configurable: true,
    });
    await createSPA({ root: container, registry: registry() });
    await settle();
    const intro = container.querySelector('#intro')!;
    const scrollIntoView = vi.fn();
    (intro as HTMLElement).scrollIntoView = scrollIntoView;

    // A native <a href="#intro"> click: the browser moved first, with no
    // router state on the entry.
    window.history.pushState(null, '', '/docs#intro');
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    await settle();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollToSpy).not.toHaveBeenCalledWith(0, 0);
    expect(loads).toBe(1);
  });

  it('should reject uncloneable state on a fragment-only navigation', async () => {
    await createSPA({ root: container, registry: registry() });
    await settle();
    expect(() =>
      navigate('/docs#intro', { state: { callback: () => 1 } })
    ).toThrow(/clone/);
    expect(window.location.hash).toBe('');
  });

  it('should replace the history entry when navigating to the current location', async () => {
    await createSPA({ root: container, registry: registry() });
    await settle();
    const length = window.history.length;

    navigate('/docs');
    await settle();

    expect(window.location.pathname).toBe('/docs');
    expect(window.history.length).toBe(length);
  });
});
