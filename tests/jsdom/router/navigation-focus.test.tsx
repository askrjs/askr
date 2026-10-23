import { resetRouteState } from '../../router-test-utils';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { createSPA, hydrateSPA, cleanupApp } from '@askrjs/askr/boot';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, group, route } from '../../../src/router/route';
import type { RenderableChild } from '../../../src/common/vnode';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { renderRouteRequestToString } from '@askrjs/askr/ssr';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

function announcer(): HTMLElement | null {
  return document.querySelector('[data-askr-announcer]');
}

describe('navigation focus and announcement', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
    document.title = '';
  });

  afterEach(() => {
    cleanup();
    announcer()?.remove();
    for (const node of Array.from(
      document.head.querySelectorAll('[data-askr-head]')
    )) {
      node.remove();
    }
  });

  const pages = () =>
    createRouteRegistry(() => {
      route('/', () => (
        <div>
          <a id="start" href="/main-page">
            go
          </a>
        </div>
      ));
      route(
        '/main-page',
        () => (
          <div>
            <nav>
              <a href="/">home</a>
            </nav>
            <main id="main">
              <h1>Main page</h1>
            </main>
          </div>
        ),
        { meta: { title: 'Main page title' } }
      );
      route('/targeted', () => (
        <div>
          <main id="main">
            <h1 id="heading">Targeted</h1>
            <section id="target" data-askr-focus-target>
              target
            </section>
          </main>
        </div>
      ));
      route('/heading-only', () => (
        <div>
          <h1 id="heading">Only a heading</h1>
        </div>
      ));
      route('/bare', () => <p>bare</p>);
    });

  it('should move focus to main and announce the document title after a push navigation', async () => {
    await createSPA({ root: container, registry: pages() });
    navigate('/main-page');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('main'))
    );
    await vi.waitFor(() =>
      expect(announcer()?.textContent).toBe('Main page title')
    );
    expect(announcer()?.getAttribute('aria-live')).toBe('polite');
    // The temporary tabindex is gone once focus leaves.
    (container.querySelector('a') as HTMLElement).focus();
    expect(container.querySelector('main')?.hasAttribute('tabindex')).toBe(
      false
    );
  });

  it('should prefer an element marked data-askr-focus-target', async () => {
    await createSPA({ root: container, registry: pages() });
    navigate('/targeted');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('#target'))
    );
  });

  it('should fall back to the first h1, then the root, and announce the pathname without a title', async () => {
    await createSPA({ root: container, registry: pages() });
    navigate('/heading-only');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('#heading'))
    );
    await vi.waitFor(() =>
      expect(announcer()?.textContent).toBe('/heading-only')
    );
    navigate('/bare');
    await vi.waitFor(() => expect(document.activeElement).toBe(container));
    await vi.waitFor(() => expect(announcer()?.textContent).toBe('/bare'));
  });

  it('should not move focus for a query-only change on the same path', async () => {
    await createSPA({ root: container, registry: pages() });
    navigate('/main-page');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('main'))
    );
    const link = container.querySelector('a') as HTMLElement;
    link.focus();
    navigate('/main-page?tab=2');
    await vi.waitFor(() => expect(window.location.search).toBe('?tab=2'));
    expect(document.activeElement).toBe(link);
  });

  it('should keep focus in a text field that survives the navigation', async () => {
    const registry = createRouteRegistry(() => {
      group(
        {
          layout: ({ children }: { children?: RenderableChild }) => (
            <div>
              <input id="search" />
              {children}
            </div>
          ),
        },
        () => {
          route('/', () => <main>one</main>);
          route('/two', () => <main>two</main>);
        }
      );
    });
    await createSPA({ root: container, registry });
    const search = container.querySelector('#search') as HTMLInputElement;
    search.focus();
    navigate('/two');
    await vi.waitFor(() =>
      expect(container.querySelector('main')?.textContent).toBe('two')
    );
    expect(document.activeElement?.id).toBe('search');
  });

  it('should leave focus and announcements alone when focus is false', async () => {
    await createSPA({
      root: container,
      registry: pages(),
      focus: false,
    });
    const start = container.querySelector('#start') as HTMLElement;
    start.focus();
    navigate('/main-page');
    await vi.waitFor(() =>
      expect(container.querySelector('main')).not.toBeNull()
    );
    expect(document.activeElement).not.toBe(container.querySelector('main'));
    expect(announcer()).toBeNull();
  });

  it('should accept a custom target selector and announcement', async () => {
    await createSPA({
      root: container,
      registry: pages(),
      focus: {
        target: 'h1',
        announce: (route) => `Now on ${route.pathname}`,
      },
    });
    navigate('/main-page');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('h1'))
    );
    await vi.waitFor(() =>
      expect(announcer()?.textContent).toBe('Now on /main-page')
    );
  });

  it('should accept a target function and silence announcements with announce false', async () => {
    await createSPA({
      root: container,
      registry: pages(),
      focus: {
        target: (root) => root.querySelector('nav a'),
        announce: false,
      },
    });
    navigate('/main-page');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('nav a'))
    );
    expect(announcer()).toBeNull();
  });

  it('should keep back/forward focus handling out of the push policy', async () => {
    await createSPA({ root: container, registry: pages() });
    navigate('/main-page');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('main'))
    );
    announcer()!.textContent = 'sentinel';

    window.history.back();
    await vi.waitFor(() =>
      expect(container.querySelector('#start')).not.toBe(null)
    );
    expect(document.activeElement).not.toBe(container.querySelector('main'));
    expect(announcer()?.textContent).toBe('sentinel');
  });

  it('should honor the focus option when hydrating', async () => {
    const registry = pages();
    const rendered = await renderRouteRequestToString({ url: '/', registry });
    if (rendered.kind !== 'render') throw new Error('expected render');
    const root = document.body.appendChild(document.createElement('div'));
    root.innerHTML = rendered.html;
    try {
      await hydrateSPA({ root, registry, focus: { announce: false } });
      navigate('/main-page');
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(root.querySelector('main'))
      );
      expect(announcer()).toBeNull();
    } finally {
      cleanupApp(root);
      root.remove();
    }
  });
});
