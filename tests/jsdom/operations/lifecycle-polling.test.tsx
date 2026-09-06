import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import {
  documentVisible,
  on,
  routeActive,
  task,
  timer,
} from '@askrjs/askr/resources';
import { state } from '../../../src/runtime/reactivity/state';
import { navigate } from '../../../src/router/navigate';
import { group, route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import type { ComponentInstance } from '../../../src/runtime';

function setDocumentVisibility(value: DocumentVisibilityState): () => void {
  const ownDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'visibilityState'
  );

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => value,
  });

  return () => {
    if (ownDescriptor) {
      Object.defineProperty(document, 'visibilityState', ownDescriptor);
      return;
    }

    delete (document as Document & { visibilityState?: unknown })
      .visibilityState;
  };
}

describe('component-scoped lifecycle and polling checks', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    resetRouteState();
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
  });

  it('should run and clean up task, timer, and listener work in child components', async () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const tick = vi.fn();
    let runCount = 0;
    let cleanupCount = 0;
    let setMounted!: (value: boolean) => void;

    function Child() {
      task(() => {
        runCount += 1;
        return () => {
          cleanupCount += 1;
        };
      });
      timer(50, tick);
      on(target, 'ping', listener);
      return <span>{'child'}</span>;
    }

    function App() {
      const mounted = state(true);
      setMounted = mounted.set;
      return <main>{mounted() ? <Child /> : null}</main>;
    }

    route('/', App);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    expect(runCount).toBe(1);
    expect(cleanupCount).toBe(0);

    target.dispatchEvent(new Event('ping'));
    expect(listener).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(160);
    expect(tick).toHaveBeenCalledTimes(3);

    setMounted(false);
    flushScheduler();

    expect(cleanupCount).toBe(1);

    target.dispatchEvent(new Event('ping'));
    vi.advanceTimersByTime(200);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('should run route layout timers only while the layout is active', async () => {
    const tick = vi.fn();

    function AdminLayout({ children }: { children?: unknown }) {
      timer(50, tick);
      return <section>{children as never}</section>;
    }

    group({ layout: AdminLayout }, () => {
      route('/admin', () => <p>{'admin'}</p>);
    });
    route('/public', () => <p>{'public'}</p>);

    window.history.replaceState({}, '', '/admin');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    vi.advanceTimersByTime(160);
    expect(tick).toHaveBeenCalledTimes(3);

    navigate('/public');
    flushScheduler();

    vi.advanceTimersByTime(200);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('should attach route leaf listeners and remove them after navigation', async () => {
    const target = new EventTarget();
    const listener = vi.fn();

    route('/listen', () => {
      on(target, 'ping', listener);
      return <p>{'listen'}</p>;
    });
    route('/other', () => <p>{'other'}</p>);

    window.history.replaceState({}, '', '/listen');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    target.dispatchEvent(new Event('ping'));
    expect(listener).toHaveBeenCalledTimes(1);

    navigate('/other');
    flushScheduler();

    target.dispatchEvent(new Event('ping'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should not run lifecycle work registered during a failed render', async () => {
    const run = vi.fn();
    const tick = vi.fn();
    const target = new EventTarget();
    const listener = vi.fn();

    function BrokenChild() {
      task(run);
      timer(50, tick);
      on(target, 'ping', listener);
      throw new Error('render failed');
    }

    route('/', () => <BrokenChild />);

    await expect(
      createSPA({ root: container, registry: currentRouteRegistry() })
    ).rejects.toThrow('render failed');

    target.dispatchEvent(new Event('ping'));
    vi.advanceTimersByTime(100);

    expect(run).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
  });

  it('should gate timer ticks with active route checks', async () => {
    const tick = vi.fn();

    function Poller() {
      timer(50, tick, {
        when: [routeActive(['/', '/admin'])],
      });
      return <p>{'poller'}</p>;
    }

    route('/', Poller);
    route('/admin', Poller);
    route('/settings', Poller);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    vi.advanceTimersByTime(110);
    expect(tick).toHaveBeenCalledTimes(2);

    navigate('/settings');
    flushScheduler();
    vi.advanceTimersByTime(110);
    expect(tick).toHaveBeenCalledTimes(2);

    navigate('/admin');
    flushScheduler();
    vi.advanceTimersByTime(110);
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it('should skip hidden document ticks and resume when visible', async () => {
    let restoreVisibility = setDocumentVisibility('visible');
    const tick = vi.fn();

    try {
      route('/', () => {
        timer(50, tick, { when: [documentVisible()] });
        return <p>{'visible'}</p>;
      });

      await createSPA({ root: container, registry: currentRouteRegistry() });
      flushScheduler();

      vi.advanceTimersByTime(110);
      expect(tick).toHaveBeenCalledTimes(2);

      restoreVisibility();
      restoreVisibility = setDocumentVisibility('hidden');
      vi.advanceTimersByTime(110);
      expect(tick).toHaveBeenCalledTimes(2);

      restoreVisibility();
      restoreVisibility = setDocumentVisibility('visible');
      vi.advanceTimersByTime(110);
      expect(tick).toHaveBeenCalledTimes(4);
    } finally {
      restoreVisibility();
    }
  });

  it('should require every timer check to pass', async () => {
    let enabled = false;
    const tick = vi.fn();

    function Poller() {
      timer(50, tick, {
        when: [routeActive('/'), () => enabled],
      });
      return <p>{'poller'}</p>;
    }

    route('/', Poller);
    route('/other', Poller);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    vi.advanceTimersByTime(110);
    expect(tick).not.toHaveBeenCalled();

    enabled = true;
    vi.advanceTimersByTime(110);
    expect(tick).toHaveBeenCalledTimes(2);

    navigate('/other');
    flushScheduler();

    vi.advanceTimersByTime(110);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('should treat createSPA route-table patterns as active route checks', async () => {
    const tick = vi.fn();

    await createSPA({
      root: container,
      registry: routeRegistryFromTable([
        {
          path: '/users/{id}',
          handler: () => {
            timer(50, tick, { when: routeActive('/users/{id}') });
            return <p>{'user'}</p>;
          },
        },
        {
          path: '/settings',
          handler: () => {
            timer(50, tick, { when: routeActive('/users/{id}') });
            return <p>{'settings'}</p>;
          },
        },
      ]),
    });
    flushScheduler();

    navigate('/users/123');
    flushScheduler();

    vi.advanceTimersByTime(110);
    expect(tick).toHaveBeenCalledTimes(2);

    navigate('/settings');
    flushScheduler();

    vi.advanceTimersByTime(110);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('should treat manifest-backed patterns as active route checks', async () => {
    const tick = vi.fn();

    route('/users/{id}', () => {
      timer(50, tick, { when: routeActive('/users/{id}') });
      return <p>{'user'}</p>;
    });
    route('/settings', () => {
      timer(50, tick, { when: routeActive('/users/{id}') });
      return <p>{'settings'}</p>;
    });

    const manifest = currentRouteManifest();
    await createSPA({
      root: container,
      registry: currentRouteRegistry(manifest),
    });
    flushScheduler();

    navigate('/users/123');
    flushScheduler();

    vi.advanceTimersByTime(110);
    expect(tick).toHaveBeenCalledTimes(2);

    navigate('/settings');
    flushScheduler();

    vi.advanceTimersByTime(110);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('should use the union of active route matches across multiple roots', async () => {
    const first = createTestContainer();
    const second = createTestContainer();
    const adminTick = vi.fn();
    const reportTick = vi.fn();

    route('/admin/{section}', () => {
      timer(50, adminTick, {
        when: routeActive('/admin/{section}'),
      });
      return <p>{'admin'}</p>;
    });
    const adminManifest = currentRouteManifest();
    const adminRoutes = currentRouteList();
    resetRouteState();

    route('/reports/{id}', () => {
      timer(50, reportTick, {
        when: routeActive('/reports/{id}'),
      });
      return <p>{'report'}</p>;
    });
    const reportManifest = currentRouteManifest();
    const reportRoutes = currentRouteList();
    resetRouteState();

    try {
      window.history.replaceState({}, '', '/admin/users');
      await createSPA({
        root: first.container,
        registry: currentRouteRegistry(adminManifest, adminRoutes),
      });
      await createSPA({
        root: second.container,
        registry: currentRouteRegistry(reportManifest, reportRoutes),
      });
      flushScheduler();

      vi.advanceTimersByTime(110);
      expect(adminTick).toHaveBeenCalledTimes(2);
      expect(reportTick).not.toHaveBeenCalled();

      navigate('/reports/42');
      flushScheduler();

      vi.advanceTimersByTime(110);
      expect(adminTick).toHaveBeenCalledTimes(2);
      expect(reportTick).toHaveBeenCalledTimes(2);
    } finally {
      cleanupApp(second.container);
      cleanupApp(first.container);
      second.cleanup();
      first.cleanup();
    }
  });

  it('should not duplicate timer work across rerenders and should call the latest callback', async () => {
    let setLabel!: (value: string) => void;
    const ticks: string[] = [];

    function Poller() {
      const label = state('first');
      setLabel = label.set;
      timer(50, () => {
        ticks.push(label());
      });
      return <button>{label()}</button>;
    }

    route('/', Poller);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    setLabel('second');
    flushScheduler();
    setLabel('third');
    flushScheduler();

    const host = container.querySelector('button') as
      | (HTMLButtonElement & { __ASKR_INSTANCE?: ComponentInstance })
      | null;

    expect(host?.__ASKR_INSTANCE?.mountOperations).toBeUndefined();

    vi.advanceTimersByTime(110);

    expect(ticks).toEqual(['third', 'third']);
  });

  it('should restart timer work when the interval changes', async () => {
    let setFast!: (value: boolean) => void;
    const tick = vi.fn();

    function Poller() {
      const fast = state(false);
      setFast = fast.set;
      timer(fast() ? 25 : 50, tick);
      return <button>{fast() ? 'fast' : 'slow'}</button>;
    }

    route('/', Poller);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    vi.advanceTimersByTime(110);
    expect(tick).toHaveBeenCalledTimes(2);

    setFast(true);
    flushScheduler();

    vi.advanceTimersByTime(100);
    expect(tick).toHaveBeenCalledTimes(6);
  });

  it('should not restart timer work from an uncommitted child rerender', async () => {
    let setFast!: (value: boolean) => void;
    let setShouldThrow!: (value: boolean) => void;
    const tick = vi.fn();

    function Poller({ fast }: { fast: boolean }) {
      timer(fast ? 25 : 50, tick);
      return <span>{fast ? 'fast' : 'slow'}</span>;
    }

    function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
      if (shouldThrow) {
        throw new Error('commit failed');
      }
      return <span>{'ok'}</span>;
    }

    function App() {
      const fast = state(false);
      const shouldThrow = state(false);
      setFast = fast.set;
      setShouldThrow = shouldThrow.set;

      return (
        <main>
          <Poller fast={fast()} />
          <Bomb shouldThrow={shouldThrow()} />
        </main>
      );
    }

    route('/', App);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    vi.advanceTimersByTime(110);
    expect(tick).toHaveBeenCalledTimes(2);

    tick.mockClear();
    setFast(true);
    setShouldThrow(true);
    expect(() => flushScheduler()).toThrow('commit failed');

    vi.advanceTimersByTime(100);
    expect(tick).toHaveBeenCalledTimes(2);

    tick.mockClear();
    setShouldThrow(false);
    flushScheduler();

    vi.advanceTimersByTime(100);
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it('should keep listener work singular and call the latest handler after rerender', async () => {
    const target = new EventTarget();
    let setLabel!: (value: string) => void;
    const events: string[] = [];

    function Listener() {
      const label = state('first');
      setLabel = label.set;
      on(target, 'ping', () => {
        events.push(label());
      });
      return <span>{label()}</span>;
    }

    route('/', Listener);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    setLabel('second');
    flushScheduler();
    setLabel('third');
    flushScheduler();

    target.dispatchEvent(new Event('ping'));

    expect(events).toEqual(['third']);
  });

  it('should reattach listener work when the target changes', async () => {
    const firstTarget = new EventTarget();
    const secondTarget = new EventTarget();
    let setUseSecond!: (value: boolean) => void;
    const listener = vi.fn();

    function Listener() {
      const useSecond = state(false);
      setUseSecond = useSecond.set;
      on(useSecond() ? secondTarget : firstTarget, 'ping', listener);
      return <span>{useSecond() ? 'second' : 'first'}</span>;
    }

    route('/', Listener);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    firstTarget.dispatchEvent(new Event('ping'));
    expect(listener).toHaveBeenCalledTimes(1);

    setUseSecond(true);
    flushScheduler();

    firstTarget.dispatchEvent(new Event('ping'));
    secondTarget.dispatchEvent(new Event('ping'));

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('should not reattach listener work from an uncommitted child rerender', async () => {
    const firstTarget = new EventTarget();
    const secondTarget = new EventTarget();
    let setUseSecond!: (value: boolean) => void;
    let setShouldThrow!: (value: boolean) => void;
    const listener = vi.fn();

    function Listener({ useSecond }: { useSecond: boolean }) {
      on(useSecond ? secondTarget : firstTarget, 'ping', listener);
      return <span>{useSecond ? 'second' : 'first'}</span>;
    }

    function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
      if (shouldThrow) {
        throw new Error('listener commit failed');
      }
      return <span>{'ok'}</span>;
    }

    function App() {
      const useSecond = state(false);
      const shouldThrow = state(false);
      setUseSecond = useSecond.set;
      setShouldThrow = shouldThrow.set;

      return (
        <main>
          <Listener useSecond={useSecond()} />
          <Bomb shouldThrow={shouldThrow()} />
        </main>
      );
    }

    route('/', App);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    firstTarget.dispatchEvent(new Event('ping'));
    expect(listener).toHaveBeenCalledTimes(1);

    setUseSecond(true);
    setShouldThrow(true);
    expect(() => flushScheduler()).toThrow('listener commit failed');

    firstTarget.dispatchEvent(new Event('ping'));
    secondTarget.dispatchEvent(new Event('ping'));
    expect(listener).toHaveBeenCalledTimes(2);

    setShouldThrow(false);
    flushScheduler();

    firstTarget.dispatchEvent(new Event('ping'));
    secondTarget.dispatchEvent(new Event('ping'));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('should not run new child lifecycle work from an uncommitted parent render', async () => {
    let setMounted!: (value: boolean) => void;
    let setShouldThrow!: (value: boolean) => void;
    const run = vi.fn();
    const tick = vi.fn();
    const target = new EventTarget();
    const listener = vi.fn();

    function Worker() {
      task(run);
      timer(50, tick);
      on(target, 'ping', listener);
      return <span>{'worker'}</span>;
    }

    function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
      if (shouldThrow) {
        throw new Error('new child commit failed');
      }
      return <span>{'ok'}</span>;
    }

    function App() {
      const mounted = state(false);
      const shouldThrow = state(false);
      setMounted = mounted.set;
      setShouldThrow = shouldThrow.set;

      return (
        <main>
          {mounted() ? <Worker /> : null}
          <Bomb shouldThrow={shouldThrow()} />
        </main>
      );
    }

    route('/', App);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    setMounted(true);
    setShouldThrow(true);
    expect(() => flushScheduler()).toThrow('new child commit failed');

    target.dispatchEvent(new Event('ping'));
    vi.advanceTimersByTime(100);

    expect(run).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();

    setShouldThrow(false);
    flushScheduler();

    expect(run).toHaveBeenCalledTimes(1);

    target.dispatchEvent(new Event('ping'));
    vi.advanceTimersByTime(110);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('should run and clean up lifecycle work for committed null components', async () => {
    let setMounted!: (value: boolean) => void;
    const run = vi.fn();
    const cleanupTask = vi.fn();
    const tick = vi.fn();
    const target = new EventTarget();
    const listener = vi.fn();

    function NullWorker() {
      task(() => {
        run();
        return cleanupTask;
      });
      timer(50, tick);
      on(target, 'ping', listener);
      return null;
    }

    function App() {
      const mounted = state(true);
      setMounted = mounted.set;
      return <main>{mounted() ? <NullWorker /> : null}</main>;
    }

    route('/', App);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    expect(run).toHaveBeenCalledTimes(1);
    expect(cleanupTask).not.toHaveBeenCalled();
    expect(container.querySelector('main')?.firstChild?.nodeType).toBe(
      Node.COMMENT_NODE
    );

    target.dispatchEvent(new Event('ping'));
    vi.advanceTimersByTime(110);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledTimes(2);

    await Promise.resolve();
    await Promise.resolve();

    setMounted(false);
    flushScheduler();

    expect(container.querySelector('main')?.childNodes.length).toBe(0);
    expect(cleanupTask).toHaveBeenCalledTimes(1);

    target.dispatchEvent(new Event('ping'));
    vi.advanceTimersByTime(110);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('should not run null child lifecycle work from an uncommitted parent render', async () => {
    let setMounted!: (value: boolean) => void;
    let setShouldThrow!: (value: boolean) => void;
    const run = vi.fn();
    const tick = vi.fn();
    const target = new EventTarget();
    const listener = vi.fn();

    function NullWorker() {
      task(run);
      timer(50, tick);
      on(target, 'ping', listener);
      return null;
    }

    function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
      if (shouldThrow) {
        throw new Error('null child commit failed');
      }
      return <span>{'ok'}</span>;
    }

    function App() {
      const mounted = state(false);
      const shouldThrow = state(false);
      setMounted = mounted.set;
      setShouldThrow = shouldThrow.set;

      return (
        <main>
          {mounted() ? <NullWorker /> : null}
          <Bomb shouldThrow={shouldThrow()} />
        </main>
      );
    }

    route('/', App);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    setMounted(true);
    setShouldThrow(true);
    expect(() => flushScheduler()).toThrow('null child commit failed');

    target.dispatchEvent(new Event('ping'));
    vi.advanceTimersByTime(100);

    expect(run).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();

    setShouldThrow(false);
    flushScheduler();

    expect(run).toHaveBeenCalledTimes(1);

    target.dispatchEvent(new Event('ping'));
    vi.advanceTimersByTime(110);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('should run task work once per committed mount across rerenders', async () => {
    let setLabel!: (value: string) => void;
    let setMounted!: (value: boolean) => void;
    const run = vi.fn();
    const cleanupTask = vi.fn();

    function Worker() {
      const label = state('first');
      setLabel = label.set;
      task(() => {
        run();
        return cleanupTask;
      });
      return <span>{label()}</span>;
    }

    function App() {
      const mounted = state(true);
      setMounted = mounted.set;
      return <main>{mounted() ? <Worker /> : null}</main>;
    }

    route('/', App);

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    setLabel('second');
    flushScheduler();
    setLabel('third');
    flushScheduler();

    expect(run).toHaveBeenCalledTimes(1);
    expect(cleanupTask).not.toHaveBeenCalled();

    setMounted(false);
    flushScheduler();

    expect(cleanupTask).toHaveBeenCalledTimes(1);

    setMounted(true);
    flushScheduler();

    expect(run).toHaveBeenCalledTimes(2);
  });
});
