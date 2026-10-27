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
  navigationState,
  redirect,
  route,
  updateRouteQuery,
} from '../../../src/router';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('blockNavigation() coverage', () => {
  let { container, cleanup } = createTestContainer();
  const unblockers: Array<() => void> = [];

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    for (const unblock of unblockers.splice(0)) unblock();
    cleanup();
    vi.restoreAllMocks();
  });

  it('should apply updateRouteQuery() without consulting blockers', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const registry = createRouteRegistry(() => {
      route('/', () => <p>a</p>);
    });
    await createSPA({ root: container, registry });
    unblockers.push(blockNavigation(() => 'Discard?'));
    unblockers.push(blockNavigation(() => true));

    // The page stays: a query change is not a departure.
    updateRouteQuery({ q: 'x' });
    expect(window.location.search).toBe('?q=x');
    expect(confirm).not.toHaveBeenCalled();
    expect(navigationState().blocked).toBe(null);
  });

  it('should traverse fragment entries without consulting blockers', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p id="section">a</p>);
    });
    await createSPA({ root: container, registry });
    const content = container.querySelector('p');
    navigate('/#section');
    const blocker = vi.fn(() => true);
    unblockers.push(blockNavigation(blocker));

    window.history.back();
    await vi.waitFor(() => expect(window.location.hash).toBe(''));
    expect(blocker).not.toHaveBeenCalled();
    expect(navigationState().blocked).toBe(null);
    expect(container.querySelector('p')).toBe(content);

    window.history.forward();
    await vi.waitFor(() => expect(window.location.hash).toBe('#section'));
    expect(blocker).not.toHaveBeenCalled();
    expect(container.querySelector('p')).toBe(content);
  });

  it('should leave the page as it is when a redirect is refused by a blocker', async () => {
    const slow = deferred<string>();
    let dirty = false;
    const registry = createRouteRegistry(() => {
      route('/', () => <p>a</p>);
      route('/login', () => <p>login</p>);
      route('/admin', () => <p>admin</p>, {
        policies: [
          async () => {
            await slow.promise;
            return redirect('/login');
          },
        ],
      });
    });
    await createSPA({ root: container, registry });
    unblockers.push(blockNavigation(() => dirty));

    navigate('/admin');
    await vi.waitFor(() => expect(navigationState().pending).toBe(true));
    dirty = true;
    slow.resolve('go');
    await vi.waitFor(() => expect(navigationState().pending).toBe(false));
    expect(container.textContent).toBe('a');
    expect(window.location.pathname).toBe('/');
    expect(navigationState().blocked).toBe('/login');
  });

  it('should not ask twice when a confirmed navigation is redirected', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const registry = createRouteRegistry(() => {
      route('/', () => <p>a</p>);
      route('/login', () => <p>login</p>);
      route('/admin', () => <p>admin</p>, {
        policies: [() => redirect('/login')],
      });
    });
    await createSPA({ root: container, registry });
    unblockers.push(blockNavigation(() => 'Leave?'));

    navigate('/admin');
    await vi.waitFor(() => expect(container.textContent).toBe('login'));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('should honor a later blocker that refuses after a confirmed route redirects', async () => {
    const slow = deferred<string>();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let refuseRedirect = false;
    const registry = createRouteRegistry(() => {
      route('/', () => <p>a</p>);
      route('/login', () => <p>login</p>);
      route('/admin', () => <p>admin</p>, {
        policies: [
          async () => {
            await slow.promise;
            return redirect('/login');
          },
        ],
      });
    });
    await createSPA({ root: container, registry });
    unblockers.push(blockNavigation(() => 'Leave?'));
    unblockers.push(blockNavigation(() => refuseRedirect));

    navigate('/admin');
    await vi.waitFor(() => expect(navigationState().pending).toBe(true));
    refuseRedirect = true;
    slow.resolve('go');

    await vi.waitFor(() => expect(navigationState().pending).toBe(false));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('a');
    expect(window.location.pathname).toBe('/');
    expect(navigationState().blocked).toBe('/login');
  });

  it('should undo a blocked traversal by re-pushing the current entry when the position is unknown', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>a</p>);
      route('/b', () => <p>b</p>);
      route('/c', () => <p>c</p>);
    });
    await createSPA({ root: container, registry });
    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    // Other code pushes an entry, so positions are unknown from here on.
    window.history.pushState({}, '', '/x');
    navigate('/c', { state: { draft: 1 } });
    await vi.waitFor(() => expect(container.textContent).toBe('c'));
    unblockers.push(blockNavigation(() => true));

    window.history.back();
    await vi.waitFor(() => expect(navigationState().blocked).toBe('/x'));
    await vi.waitFor(() => expect(window.location.pathname).toBe('/c'));
    expect(container.textContent).toBe('c');
    // The re-pushed entry is the rendered page's entry, state included.
    expect(window.history.state).toEqual(
      expect.objectContaining({
        path: '/c',
        askrHasState: true,
        askrState: { draft: 1 },
      })
    );
  });

  it('should restore directly after a blocked traversal skips unknown entries', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>a</p>);
      route('/a', () => <p>a</p>);
      route('/x', () => <p>x</p>);
      route('/y', () => <p>y</p>);
    });
    await createSPA({ root: container, registry });
    navigate('/a');
    await vi.waitFor(() => expect(window.location.pathname).toBe('/a'));

    window.history.pushState({}, '', '/x');
    window.history.pushState({}, '', '/y');

    const blocker = vi.fn(() => true);
    unblockers.push(blockNavigation(blocker));
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: window.history.state })
    );
    await vi.waitFor(() => expect(navigationState().blocked).toBe('/y'));
    await vi.waitFor(() => expect(window.location.pathname).toBe('/a'));

    expect(container.textContent).toBe('a');
    expect(blocker).toHaveBeenCalledTimes(1);
  });
});
