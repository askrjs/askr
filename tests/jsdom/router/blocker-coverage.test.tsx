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
});
