import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { Link } from '../../../src/components/link';
import {
  loadDocument,
  reloadDocument,
} from '../../../src/router/document-navigation';
import { navigate } from '../../../src/router/navigate';
import {
  createRouteRegistry,
  fallback,
  route,
} from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { resetRouteState } from '../../router-test-utils';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

async function settle(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await Promise.resolve();
    flushScheduler();
  }
}

describe('navigation the client router cannot render', () => {
  let view: ReturnType<typeof createTestContainer>;

  beforeEach(() => {
    view = createTestContainer();
    resetRouteState();
    vi.mocked(loadDocument).mockClear();
    vi.mocked(reloadDocument).mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupApp(view.container);
    view.cleanup();
    window.history.replaceState({}, '', '/');
  });

  function click(element: Element): MouseEvent {
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    element.dispatchEvent(event);
    return event;
  }

  it('should load a same-origin Link target outside the basePath as a document', async () => {
    window.history.replaceState({}, '', '/app/');
    const outside = `${window.location.origin}/marketing/pricing?plan=pro`;
    await createSPA({
      root: view.container,
      registry: createRouteRegistry(
        () => {
          route('/', () => <Link href={outside}>{'Pricing'}</Link>);
        },
        { basePath: '/app' }
      ),
    });

    click(view.container.querySelector('a')!);
    await settle();

    expect(loadDocument).toHaveBeenCalledWith(
      `${window.location.origin}/marketing/pricing?plan=pro`,
      'push'
    );
    expect(window.location.pathname).toBe('/app/');
  });

  it('should load an unmatched Link target as a document when no fallback exists', async () => {
    window.history.replaceState({}, '', '/');
    await createSPA({
      root: view.container,
      registry: createRouteRegistry(() => {
        route('/', () => <Link href="/legacy/report">{'Report'}</Link>);
      }),
    });

    click(view.container.querySelector('a')!);
    await settle();

    expect(loadDocument).toHaveBeenCalledWith(
      `${window.location.origin}/legacy/report`,
      'push'
    );
    expect(window.location.pathname).toBe('/');
    expect(view.container.textContent).toBe('Report');
  });

  it('should honor replace history when an unmatched navigation loads a document', async () => {
    window.history.replaceState({}, '', '/');
    await createSPA({
      root: view.container,
      registry: createRouteRegistry(() => {
        route('/', () => <p>{'home'}</p>);
      }),
    });

    navigate('/legacy/report', { replace: true });
    await settle();

    expect(loadDocument).toHaveBeenCalledWith(
      `${window.location.origin}/legacy/report`,
      'replace'
    );
  });

  it('should not load the current URL again when no router can render it', () => {
    window.history.replaceState({}, '', '/island?view=1');

    // Unrouted code, such as an island, navigating on mount.
    navigate('/island?view=1');

    expect(loadDocument).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('No route found')
    );
  });

  it('should render the fallback route for an unmatched Link target when one exists', async () => {
    window.history.replaceState({}, '', '/');
    await createSPA({
      root: view.container,
      registry: createRouteRegistry(() => {
        route('/', () => <Link href="/missing">{'Missing'}</Link>);
        fallback(() => <p>{'not found'}</p>);
      }),
    });

    click(view.container.querySelector('a')!);
    await settle();

    expect(view.container.textContent).toBe('not found');
    expect(window.location.pathname).toBe('/missing');
    expect(loadDocument).not.toHaveBeenCalled();
  });

  it('should reload the document when back/forward lands on an unmatched URL', async () => {
    window.history.replaceState({}, '', '/');
    await createSPA({
      root: view.container,
      registry: createRouteRegistry(() => {
        route('/', () => <p>{'home'}</p>);
      }),
    });

    window.history.pushState({}, '', '/legacy/report');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await settle();

    expect(reloadDocument).toHaveBeenCalledTimes(1);
  });

  it('should render the fallback route when back/forward lands on an unmatched URL', async () => {
    window.history.replaceState({}, '', '/');
    await createSPA({
      root: view.container,
      registry: createRouteRegistry(() => {
        route('/', () => <p>{'home'}</p>);
        fallback(() => <p>{'not found'}</p>);
      }),
    });

    window.history.pushState({}, '', '/missing');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await settle();

    expect(view.container.textContent).toBe('not found');
    expect(reloadDocument).not.toHaveBeenCalled();
  });

  it('should return to the departed entry instead of rewriting the one a failed traversal landed on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.history.replaceState({}, '', '/first');
    await createSPA({
      root: view.container,
      registry: createRouteRegistry(() => {
        route('/first', () => <p>{'first'}</p>);
        route('/broken', () => {
          throw new Error('boom');
        });
      }),
    });
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});

    // A forward entry Askr wrote earlier, one position after /first.
    window.history.pushState({ path: '/broken', askrIndex: 1 }, '', '/broken');
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: window.history.state })
    );
    await settle();

    expect(view.container.textContent).toBe('first');
    expect(replaceState).not.toHaveBeenCalledWith(
      expect.anything(),
      '',
      '/first'
    );
    expect(window.location.pathname).toBe('/broken');
    expect(go).toHaveBeenCalledExactlyOnceWith(-1);
    expect(reloadDocument).not.toHaveBeenCalled();
  });
});
