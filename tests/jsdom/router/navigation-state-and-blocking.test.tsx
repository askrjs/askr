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
import { createDataRuntime, disposeDataRuntime } from '../../../src/data';
import { navigate } from '../../../src/router/navigate';
import {
  blockNavigation,
  createRouteRegistry,
  navigationState,
  route,
  routeData,
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

describe('navigationState()', () => {
  let { container, cleanup } = createTestContainer();
  let dataRuntime = createDataRuntime();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    dataRuntime = createDataRuntime();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    disposeDataRuntime(dataRuntime);
  });

  it('should report a pending navigation until its route resolves', async () => {
    const slow = deferred<string>();
    const registry = createRouteRegistry(() => {
      route('/', () => {
        const state = navigationState();
        return <p>{state.pending ? `pending ${state.to}` : 'idle'}</p>;
      });
      route('/slow', () => <p>slow</p>, { loader: () => slow.promise });
    });
    await createSPA({ root: container, registry, dataRuntime });
    expect(container.textContent).toBe('idle');
    expect(navigationState()).toEqual({
      pending: false,
      to: null,
      revalidating: false,
    });

    navigate('/slow');
    await vi.waitFor(() => expect(container.textContent).toBe('pending /slow'));
    expect(navigationState().pending).toBe(true);

    slow.resolve('done');
    await vi.waitFor(() => expect(container.textContent).toBe('slow'));
    expect(navigationState().pending).toBe(false);
  });

  it('should report background revalidation of cached route data', async () => {
    let calls = 0;
    const second = deferred<string>();
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route(
        '/post',
        () => {
          const state = navigationState();
          return (
            <p>
              {routeData<string>()}
              {state.revalidating ? ' refreshing' : ''}
            </p>
          );
        },
        {
          loader: async () => {
            calls += 1;
            return calls === 1 ? 'v1' : second.promise;
          },
        }
      );
    });
    await createSPA({ root: container, registry, dataRuntime });
    navigate('/post');
    await vi.waitFor(() => expect(container.textContent).toBe('v1'));
    navigate('/');
    await vi.waitFor(() => expect(container.textContent).toBe('home'));

    navigate('/post');
    await vi.waitFor(() => expect(container.textContent).toBe('v1 refreshing'));
    expect(navigationState().revalidating).toBe(true);
    second.resolve('v2');
    await vi.waitFor(() => expect(container.textContent).toBe('v2'));
    expect(navigationState().revalidating).toBe(false);
  });
});

describe('blockNavigation()', () => {
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

  const registry = () =>
    createRouteRegistry(() => {
      route('/', () => <p>a</p>);
      route('/b', () => <p>b</p>);
      route('/c', () => <p>c</p>);
    });

  it('should refuse in-app navigation while a blocker returns true and allow it after unblocking', async () => {
    await createSPA({ root: container, registry: registry() });
    const unblock = blockNavigation(() => true);
    unblockers.push(unblock);

    navigate('/b');
    await Promise.resolve();
    expect(container.textContent).toBe('a');
    expect(window.location.pathname).toBe('/');

    unblock();
    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
  });

  it('should ask the visitor to confirm when the blocker returns a message', async () => {
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    await createSPA({ root: container, registry: registry() });
    unblockers.push(blockNavigation(() => 'Discard changes?'));

    navigate('/b');
    await Promise.resolve();
    expect(confirm).toHaveBeenCalledWith('Discard changes?');
    expect(container.textContent).toBe('a');

    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
  });

  it('should not ask when the blocker allows leaving', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    await createSPA({ root: container, registry: registry() });
    unblockers.push(blockNavigation(() => false));
    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('should return to the rendered entry when back is blocked', async () => {
    await createSPA({ root: container, registry: registry() });
    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    unblockers.push(blockNavigation(() => true));

    window.history.back();
    await vi.waitFor(() => expect(window.location.pathname).toBe('/b'));
    expect(container.textContent).toBe('b');
  });

  it('should let a traversal through when the visitor confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await createSPA({ root: container, registry: registry() });
    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    unblockers.push(blockNavigation(() => 'Leave?'));

    window.history.back();
    await vi.waitFor(() => expect(container.textContent).toBe('a'));
  });

  it('should guard document unload only while a blocker objects', async () => {
    await createSPA({ root: container, registry: registry() });
    let dirty = true;
    const unblock = blockNavigation(() => dirty);
    unblockers.push(unblock);

    const blocked = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    dirty = false;
    const allowed = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);

    unblock();
    dirty = true;
    const gone = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(gone);
    expect(gone.defaultPrevented).toBe(false);
  });
});
