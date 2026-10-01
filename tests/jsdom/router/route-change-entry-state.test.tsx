import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { createSPA } from '../../../src/boot';
import { state } from '../../../src/core/api/state';
import {
  createRouteRegistry,
  currentRoute,
  group,
  navigate,
  onRouteChange,
  route,
} from '../../../src/router';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { resetRouteState } from '../../router-test-utils';

type EntryObservation = {
  path: string;
  hasState: boolean;
  state: unknown;
  previousPath: string | undefined;
  previousState: unknown;
};

describe('committed route snapshots and owning browser entry state', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    resetRouteState();
    window.history.replaceState(
      { askrHasState: true, askrState: { entry: 'first' } },
      '',
      '/first'
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanups.length > 0) cleanups.pop()?.();
    resetRouteState();
    flushScheduler();
    window.history.replaceState({}, '', '/');
  });

  async function settle() {
    for (let turn = 0; turn < 3; turn++) {
      await Promise.resolve();
      flushScheduler();
    }
  }

  async function mount(
    onChange?: (entry: EntryObservation) => void,
    rerenderOnChange = false
  ) {
    const observations: EntryObservation[] = [];
    const Shell = ({ children }: { children?: unknown }) => {
      const changes = state(0);
      const snapshot = currentRoute();
      onRouteChange(
        (current, previous) => {
          const entry = {
            path: current.path,
            hasState: current.hasState,
            state: current.state,
            previousPath: previous?.path,
            previousState: previous?.state,
          };
          observations.push(entry);
          if (rerenderOnChange) changes.set((value) => value + 1);
          onChange?.(entry);
        },
        { immediate: true }
      );
      return (
        <section
          data-changes={changes()}
          data-state={JSON.stringify({
            hasState: snapshot.hasState,
            state: snapshot.state,
          })}
        >
          {children as never}
        </section>
      );
    };
    const registry = createRouteRegistry(() =>
      group({ layout: Shell }, () => {
        route('/first', () => <p>first</p>);
        route('/second', () => <h2>second</h2>);
        route('/last', () => <h3>last</h3>);
      })
    );
    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    await createSPA({ root: container, registry });
    await settle();
    return { container, observations };
  }

  it.each([
    {
      options: { state: { entry: 'second' } },
      hasState: true,
      state: { entry: 'second' },
    },
    { options: {}, hasState: false, state: undefined },
    { options: { state: undefined }, hasState: true, state: undefined },
  ])(
    'should bind a destination snapshot to its supplied state presence ($hasState, $state)',
    async ({ options, hasState, state }) => {
      const { container, observations } = await mount();
      const shell = container.querySelector('section');

      navigate('/second', options);
      await settle();

      expect(container.querySelector('section')).toBe(shell);
      expect(observations.at(-1)).toEqual({
        path: '/second',
        hasState,
        state,
        previousPath: '/first',
        previousState: { entry: 'first' },
      });
      expect(shell?.getAttribute('data-state')).toBe(
        JSON.stringify({ hasState, state })
      );
    }
  );

  it('should stage replacement and same-route query state before callbacks publish', async () => {
    const { observations } = await mount();

    navigate('/first?step=2', { replace: true, state: { entry: 'refreshed' } });
    await settle();

    expect(observations.at(-1)).toMatchObject({
      path: '/first',
      hasState: true,
      state: { entry: 'refreshed' },
      previousState: { entry: 'first' },
    });
    expect(window.history.state.askrState).toEqual({ entry: 'refreshed' });
  });

  it('should retain destination snapshots through callback-driven layout rerenders before history updates', async () => {
    const { container, observations } = await mount(undefined, true);

    navigate('/second', { state: { entry: 'second' } });
    await settle();

    expect(observations.map(({ path, state }) => ({ path, state }))).toEqual([
      { path: '/first', state: { entry: 'first' } },
      { path: '/second', state: { entry: 'second' } },
    ]);
    expect(
      container.querySelector('section')?.getAttribute('data-changes')
    ).toBe('2');
  });

  it('should retain callback-driven destination work if the subsequent history write throws', async () => {
    const { observations } = await mount(undefined, true);
    const failure = new DOMException(
      'Cannot clone history state',
      'DataCloneError'
    );
    vi.spyOn(window.history, 'pushState').mockImplementationOnce(() => {
      throw failure;
    });

    expect(() =>
      navigate('/second', { state: { entry: 'published' } })
    ).toThrow(failure);
    await settle();

    expect(observations.map(({ path, state }) => ({ path, state }))).toEqual([
      { path: '/first', state: { entry: 'first' } },
      { path: '/second', state: { entry: 'published' } },
    ]);
    expect(window.location.pathname).toBe('/first');

    navigate('/second?retry=1', { state: { entry: 'retry' } });
    await settle();

    expect(observations.at(-1)).toMatchObject({
      path: '/second',
      state: { entry: 'retry' },
    });
    expect(window.location.pathname).toBe('/second');
  });

  it('should read a supplied state getter once and retain that value in snapshots and history', async () => {
    const { observations } = await mount();
    let reads = 0;
    const options = {
      get state() {
        return { entry: 'getter', read: ++reads };
      },
    };

    navigate('/second', options);
    await settle();

    expect(reads).toBe(1);
    expect(observations.at(-1)?.state).toEqual({ entry: 'getter', read: 1 });
    expect(window.history.state.askrState).toEqual(observations.at(-1)?.state);
  });

  it('should read the landed history entry for popstate snapshots', async () => {
    const { observations } = await mount();
    const landed = {
      path: '/second',
      askrHasState: true,
      askrState: { entry: 'landed' },
    };
    window.history.replaceState(landed, '', '/second');

    window.dispatchEvent(new PopStateEvent('popstate', { state: landed }));
    await settle();

    expect(observations.at(-1)).toMatchObject({
      path: '/second',
      hasState: true,
      state: { entry: 'landed' },
      previousState: { entry: 'first' },
    });
  });

  it('should keep each matched root snapshot bound to the same destination entry', async () => {
    const first = await mount();
    const second = await mount();

    navigate('/second', { state: { entry: 'both' } });
    await settle();

    for (const app of [first, second]) {
      expect(app.observations.at(-1)).toMatchObject({
        path: '/second',
        hasState: true,
        state: { entry: 'both' },
        previousState: { entry: 'first' },
      });
      expect(
        app.container.querySelector('section')?.getAttribute('data-state')
      ).toBe('{"hasState":true,"state":{"entry":"both"}}');
    }
  });

  it('should discard destination state when a later root DOM write fails', async () => {
    const first = await mount();
    const second = await mount();
    const secondShell = second.container.querySelector('section');
    const insertBefore = Element.prototype.insertBefore;
    const failure = new Error('Second destination write failed');
    const injection = vi
      .spyOn(Element.prototype, 'insertBefore')
      .mockImplementation(function <T extends Node>(
        this: Element,
        node: T,
        child: Node | null
      ): T {
        if (this === secondShell) throw failure;
        return insertBefore.call(this, node, child) as T;
      });

    expect(() =>
      navigate('/second', { state: { entry: 'discarded' } })
    ).toThrow(failure);
    injection.mockRestore();
    await settle();

    for (const app of [first, second]) {
      expect(app.observations).toHaveLength(1);
      expect(app.container.textContent).toBe('first');
      expect(
        app.container.querySelector('section')?.getAttribute('data-state')
      ).toBe('{"hasState":true,"state":{"entry":"first"}}');
    }
    expect(window.location.pathname).toBe('/first');
    expect(window.history.state.askrState).toEqual({ entry: 'first' });

    navigate('/second', { state: { entry: 'retained' } });
    await settle();

    expect(first.observations.at(-1)?.state).toEqual({ entry: 'retained' });
    expect(second.observations.at(-1)?.state).toEqual({ entry: 'retained' });
  });

  it('should preserve reentrant destination state without changing lifecycle-before-history ordering', async () => {
    let historyAtCallback: string | undefined;
    const first = await mount((entry) => {
      if (entry.path === '/second') {
        historyAtCallback = window.location.pathname;
        navigate('/last', { state: { entry: 'last' } });
      }
    }, true);
    const second = await mount(undefined, true);

    navigate('/second', { state: { entry: 'superseded' } });
    await settle();

    expect(historyAtCallback).toBe('/first');
    expect(window.location.pathname).toBe('/last');
    expect(window.history.state.askrState).toEqual({ entry: 'last' });
    for (const app of [first, second]) {
      expect(
        app.observations.find((entry) => entry.path === '/second')?.state
      ).toEqual({ entry: 'superseded' });
      expect(app.observations.at(-1)).toMatchObject({
        path: '/last',
        hasState: true,
        state: { entry: 'last' },
      });
      expect(app.observations.map((entry) => entry.path)).toEqual([
        '/first',
        '/second',
        '/last',
      ]);
      expect(app.container.textContent).toBe('last');
    }
  });
});
