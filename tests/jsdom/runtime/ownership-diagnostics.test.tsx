import { resetRouteState, currentRouteRegistry } from '../../router-test-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import { createDataRuntime, createQuery } from '../../../src/data';
import { resolveDataRuntimeState } from '../../../src/data/data-runtime';
import { Portal } from '../../../src/foundations';
import { resource, stream, timer } from '../../../src/resources';
import { navigate } from '../../../src/router/navigate';
import { route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../../../test-utils/render/test-renderer';

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
  flushScheduler();
}

describe('route-owned work', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    resetRouteState();
    vi.useRealTimers();
  });

  it('should release route-owned work each time the route is left', async () => {
    const dataRuntime = createDataRuntime();
    const live = { resources: 0, streams: 0 };
    let ticks = 0;

    function InstrumentedRoute() {
      const query = createQuery({
        runtime: dataRuntime,
        key: 'route-owned-work',
        initialData: { label: 'query' },
        fetch: async () => ({ label: 'query' }),
      });
      const currentResource = resource(({ signal }) => {
        live.resources += 1;
        signal.addEventListener('abort', () => (live.resources -= 1));
        return 'resource';
      }, []);
      timer(1_000, () => {
        ticks += 1;
      });
      stream(async function* ({ signal }) {
        live.streams += 1;
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              live.streams -= 1;
              resolve();
            },
            { once: true }
          );
        });
        yield* [];
      });
      Portal({
        children: <aside data-route-portal={'true'}>{'portal'}</aside>,
      });

      return (
        <main>
          {`${query.data?.label ?? ''}:${currentResource.value ?? 'pending'}`}
        </main>
      );
    }

    route('/instrumented', InstrumentedRoute);
    route('/plain', () => <main>{'plain'}</main>);
    window.history.replaceState({}, '', '/instrumented');
    await createSPA({
      root: container,
      registry: currentRouteRegistry(),
      dataRuntime,
    });
    await settle();

    const queryCache = resolveDataRuntimeState(dataRuntime).queryCache;
    const portals = () => container.querySelectorAll('[data-route-portal]');
    const expectActive = () => {
      expect(live).toEqual({ resources: 1, streams: 1 });
      expect(queryCache.size).toBe(1);
      expect(portals()).toHaveLength(1);
      expect(getSchedulerState().queueLength).toBe(0);
    };
    expectActive();
    vi.advanceTimersByTime(1_000);
    expect(ticks).toBe(1);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      navigate('/plain');
      await settle();

      expect(live).toEqual({ resources: 0, streams: 0 });
      expect(queryCache.size).toBe(0);
      expect(portals()).toHaveLength(0);
      expect(getSchedulerState().queueLength).toBe(0);
      ticks = 0;
      vi.advanceTimersByTime(5_000);
      expect(ticks).toBe(0);

      navigate('/instrumented');
      await settle();
      expectActive();
    }

    cleanupApp(container);
    await settle();
    expect(live).toEqual({ resources: 0, streams: 0 });
    expect(queryCache.size).toBe(0);
  });
});
