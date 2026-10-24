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
  Link,
  createRouteRegistry,
  redirect as redirectTo,
  route,
} from '../../../src/router';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

type Stub = {
  calls: number;
  seenInside: string[];
  finished: Promise<void>[];
};

function stubViewTransition(container: HTMLElement, defer = false): Stub {
  const stub: Stub = { calls: 0, seenInside: [], finished: [] };
  (document as unknown as Record<string, unknown>).startViewTransition = (
    update: () => void | Promise<void>
  ) => {
    stub.calls += 1;
    const run = () => {
      const result = update();
      stub.seenInside.push(container.textContent ?? '');
      return result;
    };
    const updateCallbackDone = defer
      ? Promise.resolve().then(run)
      : Promise.resolve(run());
    const finished = updateCallbackDone.then(() => undefined);
    stub.finished.push(finished);
    return { ready: Promise.resolve(), updateCallbackDone, finished };
  };
  return stub;
}

describe('view transitions', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).startViewTransition;
    cleanup();
    vi.restoreAllMocks();
  });

  const registry = () =>
    createRouteRegistry(() => {
      route('/', () => (
        <div>
          <p>a</p>
          <Link href="/b" viewTransition>
            go b
          </Link>
        </div>
      ));
      route('/b', () => <p>b</p>);
      route('/c', () => <p>c</p>);
    });

  it('should commit the navigation inside the transition callback when requested', async () => {
    await createSPA({ root: container, registry: registry() });
    const stub = stubViewTransition(container, true);

    navigate('/b', { viewTransition: true });
    // The old page stays until the browser runs the update callback.
    expect(container.textContent).toContain('a');
    await vi.waitFor(() => expect(stub.calls).toBe(1));
    await stub.finished[0];
    expect(stub.seenInside).toEqual(['b']);
    expect(window.location.pathname).toBe('/b');
  });

  it('should navigate directly when startViewTransition is unavailable', async () => {
    await createSPA({ root: container, registry: registry() });
    navigate('/b', { viewTransition: true });
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
  });

  it('should not use a transition by default', async () => {
    await createSPA({ root: container, registry: registry() });
    const stub = stubViewTransition(container);
    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    expect(stub.calls).toBe(0);
  });

  it('should transition every navigation when the app option is true and let a call opt out', async () => {
    await createSPA({
      root: container,
      registry: registry(),
      viewTransitions: true,
    });
    const stub = stubViewTransition(container);
    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    expect(stub.calls).toBe(1);
    navigate('/c', { viewTransition: false });
    await vi.waitFor(() => expect(container.textContent).toBe('c'));
    expect(stub.calls).toBe(1);
  });

  it('should ask a function option with the departing and arriving hrefs', async () => {
    const decide = vi.fn((_from: string, to: string) => to === '/c');
    await createSPA({
      root: container,
      registry: registry(),
      viewTransitions: decide,
    });
    const stub = stubViewTransition(container);
    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    expect(stub.calls).toBe(0);
    navigate('/c');
    await vi.waitFor(() => expect(container.textContent).toBe('c'));
    expect(stub.calls).toBe(1);
    expect(decide).toHaveBeenCalledWith('/b', '/c');
  });

  it('should navigate directly when the option function throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await createSPA({
      root: container,
      registry: registry(),
      viewTransitions: () => {
        throw new Error('boom');
      },
    });
    const stub = stubViewTransition(container);
    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    expect(stub.calls).toBe(0);
    expect(error).toHaveBeenCalled();
  });

  it('should honor the app option for a back traversal', async () => {
    await createSPA({
      root: container,
      registry: registry(),
      viewTransitions: true,
    });
    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    const stub = stubViewTransition(container);
    window.history.back();
    await vi.waitFor(() => expect(container.textContent).toContain('a'));
    expect(stub.calls).toBe(1);
    expect(stub.seenInside[0]).toContain('a');
  });

  it('should transition a Link click that sets viewTransition', async () => {
    await createSPA({ root: container, registry: registry() });
    const stub = stubViewTransition(container);
    container.querySelector('a')!.click();
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    expect(stub.calls).toBe(1);
  });

  it('should keep a redirect inside the requested transition', async () => {
    const redirecting = createRouteRegistry(() => {
      route('/', () => <p>a</p>);
      route('/b', () => <p>b</p>, {
        policies: [() => redirectTo('/c')],
      });
      route('/c', () => <p>c</p>);
    });
    await createSPA({ root: container, registry: redirecting });
    const stub = stubViewTransition(container);
    navigate('/b', { viewTransition: true });
    await vi.waitFor(() => expect(container.textContent).toBe('c'));
    expect(stub.calls).toBe(1);
  });

  it('should not transition a fragment-only move', async () => {
    await createSPA({
      root: container,
      registry: registry(),
      viewTransitions: true,
    });
    const stub = stubViewTransition(container);
    navigate('/#x');
    await Promise.resolve();
    expect(stub.calls).toBe(0);
    expect(window.location.hash).toBe('#x');
  });

  it('should let a stale transition callback do nothing', async () => {
    await createSPA({ root: container, registry: registry() });
    const stub = stubViewTransition(container, true);
    navigate('/b', { viewTransition: true });
    navigate('/c');
    await vi.waitFor(() => expect(container.textContent).toBe('c'));
    await Promise.all(stub.finished);
    expect(container.textContent).toBe('c');
    expect(window.location.pathname).toBe('/c');
  });
});
