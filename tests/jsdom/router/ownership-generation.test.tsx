import { resetRouteState, currentRouteRegistry } from '../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { createDataRuntime, createQuery } from '../../../src/data';
import { derive, selector, state, type State } from '../../../src';
import { For } from '../../../src/control';
import { task } from '../../../src/resources';
import { Portal } from '../../../src/foundations';
import { navigate } from '../../../src/router/navigate';
import { route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('route ownership generations', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const testContainer = createTestContainer();
    container = testContainer.container;
    cleanup = testContainer.cleanup;
    resetRouteState();
  });

  afterEach(() => cleanup());

  it('should detach only the departed query generation across repeated routes', async () => {
    const runtime = createDataRuntime();
    let cleanups = 0;

    const page = (name: string) => () => {
      const query = createQuery({
        runtime,
        key: `route:${name}`,
        initialData: { name },
        fetch: async () => ({ name }),
      });
      task(() => () => {
        cleanups += 1;
      });
      return <p>{query.data?.name}</p>;
    };

    route('/a', page('a'));
    route('/b', page('b'));
    window.history.replaceState({}, '', '/a');
    await createSPA({
      root: container,
      registry: currentRouteRegistry(),
      dataRuntime: runtime,
    });
    flushScheduler();
    await Promise.resolve();

    for (let cycle = 0; cycle < 4; cycle += 1) {
      navigate('/b');
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      expect(container.textContent).toBe('b');
      expect(runtime.queryCache.size).toBe(1);

      navigate('/a');
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      expect(container.textContent).toBe('a');
      expect(runtime.queryCache.size).toBe(1);
    }

    expect(cleanups).toBe(8);
  });

  it('should isolate derive, selector, and For hooks across repeated route generations', async () => {
    type RouteControl = {
      value: State<number>;
      rows: State<string[]>;
    };
    const controls = new Map<string, RouteControl>();

    const page = (name: string, initialValue: number) => () => {
      const value = state(initialValue);
      const doubled = derive(() => value() * 2);
      const isSelected = selector(value);
      const rows = state([`${name}-one`, `${name}-two`]);
      controls.set(name, { value, rows });

      return (
        <section
          data-route={name}
          data-derived={() => String(doubled())}
          data-initial-selected={() => String(isSelected(initialValue))}
          data-next-selected={() => String(isSelected(initialValue + 1))}
        >
          <For each={rows} by={(row) => row}>
            {(row) => <p>{row}</p>}
          </For>
        </section>
      );
    };

    route('/a', page('a', 10));
    route('/b', page('b', 20));
    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    let departed = controls.get('a')!;

    for (let cycle = 0; cycle < 6; cycle += 1) {
      const name = cycle % 2 === 0 ? 'b' : 'a';
      const initialValue = name === 'a' ? 10 : 20;
      navigate(`/${name}`);
      flushScheduler();

      const current = controls.get(name)!;
      expect(current).not.toBe(departed);
      const subject = container.querySelector(`[data-route="${name}"]`)!;
      expect(subject.getAttribute('data-derived')).toBe(
        String(initialValue * 2)
      );
      expect(subject.getAttribute('data-initial-selected')).toBe('true');
      expect(subject.getAttribute('data-next-selected')).toBe('false');
      expect(
        Array.from(subject.querySelectorAll('p'), (row) => row.textContent)
      ).toEqual([`${name}-one`, `${name}-two`]);

      departed.value.set(999);
      departed.rows.set(['departed']);
      flushScheduler();

      expect(subject.getAttribute('data-derived')).toBe(
        String(initialValue * 2)
      );
      expect(subject.getAttribute('data-initial-selected')).toBe('true');
      expect(subject.getAttribute('data-next-selected')).toBe('false');
      expect(
        Array.from(subject.querySelectorAll('p'), (row) => row.textContent)
      ).toEqual([`${name}-one`, `${name}-two`]);

      current.value.set(initialValue + 1);
      flushScheduler();
      expect(subject.getAttribute('data-derived')).toBe(
        String((initialValue + 1) * 2)
      );
      expect(subject.getAttribute('data-initial-selected')).toBe('false');
      expect(subject.getAttribute('data-next-selected')).toBe('true');

      current.rows.set([`${name}-updated`, `${name}-added`]);
      flushScheduler();
      expect(
        Array.from(subject.querySelectorAll('p'), (row) => row.textContent)
      ).toEqual([`${name}-updated`, `${name}-added`]);

      departed = current;
    }
  });

  it('should isolate keyed and fragment For boundaries across route generations', async () => {
    type Row = { id: string | number; label: string };
    type RouteControl = {
      keyedRows: State<Row[]>;
      fragmentRows: State<Row[]>;
    };
    const controls = new Map<string, RouteControl>();

    const page = (name: string) => () => {
      const keyedRows = state<Row[]>([
        { id: 1, label: `${name}-one` },
        { id: 2, label: `${name}-two` },
      ]);
      const fragmentRows = state<Row[]>([
        { id: `${name}-first`, label: `${name}-fragment-one` },
        { id: `${name}-second`, label: `${name}-fragment-two` },
      ]);
      controls.set(name, { keyedRows, fragmentRows });

      return (
        <section data-for-route={name}>
          <div data-keyed-list={name}>
            <For each={keyedRows} by={(row) => row.id}>
              {(row) => <p data-keyed-row={String(row.id)}>{row.label}</p>}
            </For>
          </div>
          <div data-fragment-list={name}>
            <For each={fragmentRows} by={(row) => row.id}>
              {(row) => (
                <>
                  <span data-fragment-row={String(row.id)}>{row.label}</span>
                  <small>{`detail:${row.label}`}</small>
                </>
              )}
            </For>
          </div>
        </section>
      );
    };

    route('/a', page('a'));
    route('/b', page('b'));
    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    let departed = controls.get('a')!;

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const name = cycle % 2 === 0 ? 'b' : 'a';
      navigate(`/${name}`);
      flushScheduler();

      const current = controls.get(name)!;
      const subject = container.querySelector(`[data-for-route="${name}"]`)!;
      expect(
        Array.from(
          subject.querySelectorAll('[data-keyed-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-one`, `${name}-two`]);
      expect(
        Array.from(
          subject.querySelectorAll('[data-fragment-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-fragment-one`, `${name}-fragment-two`]);

      departed.keyedRows.set([{ id: 1, label: 'departed-keyed' }]);
      departed.fragmentRows.set([
        { id: 'departed-fragment', label: 'departed-fragment' },
      ]);
      flushScheduler();
      expect(
        Array.from(
          subject.querySelectorAll('[data-keyed-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-one`, `${name}-two`]);
      expect(
        Array.from(
          subject.querySelectorAll('[data-fragment-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-fragment-one`, `${name}-fragment-two`]);

      current.keyedRows.set([
        { id: 1, label: `${name}-one-updated` },
        { id: 2, label: `${name}-two-updated` },
      ]);
      current.fragmentRows.set([
        { id: `${name}-third`, label: `${name}-fragment-updated` },
      ]);
      flushScheduler();
      expect(
        Array.from(
          subject.querySelectorAll('[data-keyed-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-one-updated`, `${name}-two-updated`]);
      expect(
        Array.from(
          subject.querySelectorAll('[data-fragment-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-fragment-updated`]);

      departed = current;
    }

    cleanup();
    cleanup = () => {};
    departed.keyedRows.set([{ id: 1, label: 'after-unmount' }]);
    departed.fragmentRows.set([
      { id: 'after-unmount', label: 'after-unmount' },
    ]);
    flushScheduler();
    expect(container.isConnected).toBe(false);
  });

  it('should restore the previous For boundary owner when a destination fails', async () => {
    let stableRows!: State<string[]>;
    const Broken = () => {
      throw new Error('For destination failed');
    };

    route('/stable', () => {
      stableRows = state(['stable']);
      return (
        <section data-for-rollback="stable">
          <div data-for-rollback-list="stable">
            <For each={stableRows} by={(row) => row}>
              {(row) => <p>{row}</p>}
            </For>
          </div>
          <span>ready</span>
        </section>
      );
    });
    route('/broken', () => {
      const candidateRows = state(['candidate']);
      return (
        <section data-for-rollback="broken">
          <div data-for-rollback-list="broken">
            <For each={candidateRows} by={(row) => row}>
              {(row) => <p>{row}</p>}
            </For>
          </div>
          <Broken />
        </section>
      );
    });

    window.history.replaceState({}, '', '/stable');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();
    const stableList = container.querySelector('[data-for-rollback-list]')!;
    const stableRow = stableList.firstElementChild;

    expect(() => navigate('/broken')).toThrow('For destination failed');
    expect(window.location.pathname).toBe('/stable');
    expect(
      container
        .querySelector('[data-for-rollback]')
        ?.getAttribute('data-for-rollback')
    ).toBe('stable');
    expect(container.querySelector('[data-for-rollback-list]')).toBe(
      stableList
    );
    expect(stableList.firstElementChild).toBe(stableRow);
    expect(stableList.textContent).toBe('stable');

    stableRows.set(['stable-updated']);
    flushScheduler();
    expect(stableList.textContent).toBe('stable-updated');
  });

  it('should keep departed readable updates from rerendering the destination', async () => {
    let departed: State<number> | undefined;
    let destinationRenders = 0;

    route('/a', () => {
      departed = state(0);
      return <p>{String(departed())}</p>;
    });
    route('/b', () => {
      destinationRenders += 1;
      return <p>destination</p>;
    });

    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();
    navigate('/b');
    flushScheduler();

    departed?.set(1);
    flushScheduler();

    expect(container.textContent).toBe('destination');
    expect(destinationRenders).toBe(1);
  });

  it('should not turn a departed cleanup update into a destination rerender', async () => {
    let departed: State<number> | undefined;
    let destinationRenders = 0;

    route('/a', () => {
      departed = state(0);
      task(() => () => departed!.set(1));
      return <p>{String(departed())}</p>;
    });
    route('/b', () => {
      destinationRenders += 1;
      return <p>destination</p>;
    });

    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();
    navigate('/b');
    flushScheduler();

    expect(container.textContent).toBe('destination');
    expect(destinationRenders).toBe(1);
  });

  it('should settle an old async task cleanup outside the destination generation', async () => {
    let resolveTask!: (cleanup: () => void) => void;
    let oldTaskCleanups = 0;

    route('/a', () => {
      task(
        () =>
          new Promise<() => void>((resolve) => {
            resolveTask = resolve;
          })
      );
      return <p>source</p>;
    });
    route('/b', () => <p>destination</p>);

    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    navigate('/b');
    flushScheduler();
    resolveTask(() => {
      oldTaskCleanups += 1;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(container.textContent).toBe('destination');
    expect(oldTaskCleanups).toBe(1);
  });

  it('should preserve the destination portal when the departed generation used the same root owner', async () => {
    const page = (name: string) => () => {
      Portal({
        children: <aside data-route-portal={name}>{name}</aside>,
      });
      return <p>{`route ${name}`}</p>;
    };

    route('/a', page('a'));
    route('/b', page('b'));
    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    expect(container.querySelector('[data-route-portal="a"]')).not.toBeNull();

    navigate('/b');
    flushScheduler();

    expect(container.textContent).toContain('route b');
    expect(container.querySelector('[data-route-portal="a"]')).toBeNull();
    expect(container.querySelector('[data-route-portal="b"]')).not.toBeNull();
  });
});
