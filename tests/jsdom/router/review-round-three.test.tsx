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
import {
  blockNavigation,
  createRouteRegistry,
  currentAuth,
  forbidden,
  group,
  lazy,
  route,
} from '../../../src/router';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

const identity = (id: string) => ({
  authenticated: true,
  principal: { id, subject: id },
  session: null,
  tenant: null,
  scopes: [],
});

describe('review round three: router', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    sessionStorage.clear();
  });
  afterEach(() => cleanup());

  it('should publish the resolved identity on a denied route', async () => {
    window.history.replaceState({}, '', '/admin');
    const registry = createRouteRegistry(
      () => {
        route('/admin', () => <main>admin</main>, {
          policies: [() => forbidden()],
          forbidden: ({ status }) => (
            <main>{`denied ${status} as ${currentAuth().principal?.id}`}</main>
          ),
        });
      },
      { auth: { resolve: () => identity('alice') } }
    );
    await createSPA({ root: container, registry });
    await vi.waitFor(() =>
      expect(container.textContent).toBe('denied 403 as alice')
    );
  });

  it('should not consult blockers for a fragment-only navigation', async () => {
    window.history.replaceState({}, '', '/docs');
    const registry = createRouteRegistry(() => {
      route('/docs', () => (
        <article>
          <p id="intro">intro</p>
        </article>
      ));
      route('/other', () => <p>other</p>);
    });
    await createSPA({ root: container, registry });
    const blocker = vi.fn(() => true);
    const unblock = blockNavigation(blocker);
    try {
      navigate('/docs#intro');
      await Promise.resolve();
      expect(window.location.hash).toBe('#intro');
      expect(blocker).not.toHaveBeenCalled();
      navigate('/other');
      await Promise.resolve();
      expect(blocker).toHaveBeenCalled();
      expect(window.location.pathname).toBe('/docs');
    } finally {
      unblock();
    }
  });

  it('should not re-arm the stale-deployment reload when only a layout chunk loads', async () => {
    window.history.replaceState({}, '', '/');
    // This document already reloaded once for a missing chunk.
    sessionStorage.setItem('askr:stale-deployment-reload', '1');
    const { loadDocument } =
      await import('../../../src/router/document-navigation');
    const Layout = lazy(() =>
      Promise.resolve(({ children }: { children?: unknown }) => (
        <div>{children as never}</div>
      ))
    );
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      group({ layout: Layout }, () => {
        route(
          '/page',
          lazy(async () => {
            const failure = new TypeError(
              'Failed to fetch dynamically imported module: /page.js'
            );
            throw failure;
          }),
          { error: () => <p>error shown</p> }
        );
      });
    });
    await createSPA({ root: container, registry });
    navigate('/page');
    await vi.waitFor(() => expect(container.textContent).toBe('error shown'));
    expect(vi.mocked(loadDocument)).not.toHaveBeenCalled();
    expect(
      sessionStorage.getItem('askr:stale-deployment-reload')
    ).not.toBeNull();

    // A navigation that commits with its chunk proves the deployment is
    // consistent, so the marker clears for a later genuine stale chunk.
    navigate('/');
    await vi.waitFor(() => expect(container.textContent).toBe('home'));
    expect(
      sessionStorage.getItem('askr:stale-deployment-reload')
    ).not.toBeNull();
  });
});
