import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { state, type State } from '../../../src/index';
import { cleanupApp } from '../../../src/boot';
import { registerRootCleanupCallback } from '../../../src/boot/root-lifecycle';
import { For, Show } from '../../../src/control';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { registerMountOperation } from '../../../src/runtime';
import {
  disableEventDelegation,
  enableEventDelegation,
} from '../../../src/renderer/props/events';
import {
  cleanupInstanceIfPresent,
  removeAllListeners,
  teardownNodeSubtree,
} from '../../../src/renderer/ownership/cleanup';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

function leavesOf(values: readonly unknown[]): unknown[] {
  const leaves: unknown[] = [];
  const collect = (value: unknown): void => {
    if (value instanceof AggregateError) value.errors.forEach(collect);
    else leaves.push(value);
  };
  values.forEach(collect);
  return leaves;
}

// Teardown (refs, listeners, reactive props, component lifetimes) drains every
// sibling and descendant before surfacing failures. Non-strict teardown
// reports them through reportError once the current task finishes, the channel
// used for event handler errors, in every build; strict teardown throws them
// to its caller. Every failure reaches exactly one of the two channels.
describe.each(['development', 'production'])(
  'teardown error reporting (%s)',
  (nodeEnv) => {
    let container: HTMLElement;
    let cleanup: () => void;
    let previousNodeEnv: string | undefined;
    let reportError: ReturnType<typeof vi.fn>;
    let consoleError: ReturnType<typeof vi.spyOn>;
    let warn: ReturnType<typeof vi.spyOn>;

    const reported = () => reportError.mock.calls.map((call) => call[0]);

    beforeEach(() => {
      previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = nodeEnv;
      reportError = vi.fn();
      vi.stubGlobal('reportError', reportError);
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ({ container, cleanup } = createTestContainer());
    });

    afterEach(async () => {
      cleanup();
      await drainMicrotasks();
      _resetDefaultPortal();
      enableEventDelegation();
      process.env.NODE_ENV = previousNodeEnv;
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    function throwingRef(error: Error) {
      return (element: Element | null) => {
        if (element === null) throw error;
      };
    }

    function mountToggle(render: () => unknown, cleanupStrict = false) {
      let show!: State<boolean>;
      const App = () => {
        show = state(true);
        return <main>{show() ? render() : null}</main>;
      };
      createIsland({ root: container, component: App, cleanupStrict });
      flushScheduler();
      return () => {
        show.set(false);
        flushScheduler();
      };
    }

    function throwingCleanup(error: Error, name: string) {
      return function ThrowingCleanup() {
        registerMountOperation(() => () => {
          throw error;
        });
        return <p>{name}</p>;
      };
    }

    function trackedCleanup(onCleanup: () => void) {
      return function TrackedCleanup() {
        registerMountOperation(() => onCleanup);
        return <p>sibling</p>;
      };
    }

    it('should report a throwing ref cleanup after sibling refs are cleared', async () => {
      const error = new Error('ref cleanup failed');
      const sibling = vi.fn();
      const remove = mountToggle(() => (
        <section>
          <i ref={throwingRef(error)} />
          <b ref={sibling} />
        </section>
      ));

      remove();
      await drainMicrotasks();

      expect(container.querySelector('section')).toBeNull();
      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reported()).toEqual([error]);
    });

    it('should defer reports until the update that tore down the subtree finishes', async () => {
      const error = new Error('ref cleanup failed');
      const remove = mountToggle(() => <i ref={throwingRef(error)} />);

      remove();

      expect(reportError).not.toHaveBeenCalled();
      await drainMicrotasks();
      expect(reported()).toEqual([error]);
    });

    it('should report a throwing listener cleanup and keep draining the subtree', async () => {
      disableEventDelegation();
      const error = new Error('listener cleanup failed');
      const sibling = vi.fn();
      const remove = mountToggle(() => (
        <section>
          <button id="btn" onClick={() => {}} />
          <b ref={sibling} />
        </section>
      ));
      const button = container.querySelector('#btn')!;
      button.removeEventListener = () => {
        throw error;
      };

      remove();
      await drainMicrotasks();

      expect(container.querySelector('section')).toBeNull();
      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reported()).toEqual([error]);
    });

    it('should report a failing strict component cleanup and still dispose its siblings', async () => {
      const error = new Error('component cleanup failed');
      const siblingCleanup = vi.fn();
      const Failing = throwingCleanup(error, 'failing');
      const Sibling = trackedCleanup(siblingCleanup);
      const remove = mountToggle(
        () => (
          <section>
            <Failing />
            <Sibling />
          </section>
        ),
        true
      );

      remove();
      await drainMicrotasks();

      expect(siblingCleanup).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reported()[0]).toBeInstanceOf(AggregateError);
      expect(leavesOf(reported())).toEqual([error]);
    });

    it('should report a failing non-strict component cleanup', async () => {
      const error = new Error('component cleanup failed');
      const siblingCleanup = vi.fn();
      const Failing = throwingCleanup(error, 'failing');
      const Sibling = trackedCleanup(siblingCleanup);
      const remove = mountToggle(() => (
        <section>
          <Failing />
          <Sibling />
        </section>
      ));

      remove();
      await drainMicrotasks();

      expect(siblingCleanup).toHaveBeenCalledTimes(1);
      expect(reported()).toEqual([error]);
    });

    it('should aggregate several sibling failures into one report', async () => {
      const first = new Error('first ref cleanup failed');
      const second = new Error('second ref cleanup failed');
      const sibling = vi.fn();
      const remove = mountToggle(() => (
        <section>
          <i ref={throwingRef(first)} />
          <b ref={sibling} />
          <u ref={throwingRef(second)} />
        </section>
      ));

      remove();
      await drainMicrotasks();

      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reported()[0]).toBeInstanceOf(AggregateError);
      expect((reported()[0] as AggregateError).errors).toEqual([first, second]);
    });

    it('should report each failure once when a keyed row shares a parent with static content', async () => {
      const first = new Error('row 1 ref cleanup failed');
      const third = new Error('row 3 ref cleanup failed');
      const refs = new Map<number, (element: Element | null) => void>([
        [1, throwingRef(first)],
        [2, () => {}],
        [3, throwingRef(third)],
      ]);
      let rows!: State<number[]>;
      const App = () => {
        rows = state([1, 2, 3]);
        return (
          <ul>
            <p>static</p>
            <For each={rows} by={(row) => row}>
              {(row) => <li ref={refs.get(row)}>{row}</li>}
            </For>
          </ul>
        );
      };
      createIsland({ root: container, component: App });
      flushScheduler();

      rows.set([2]);
      flushScheduler();
      await drainMicrotasks();

      expect(container.querySelectorAll('li')).toHaveLength(1);
      expect(leavesOf(reported())).toEqual([first, third]);
    });

    it('should let a reportError handler update state', async () => {
      const error = new Error('ref cleanup failed');
      let rows!: State<number[]>;
      let failures!: State<number>;
      reportError.mockImplementation(() => {
        failures.set(failures() + 1);
      });
      const App = () => {
        rows = state([1, 2]);
        failures = state(0);
        return (
          <ul>
            <p id="failures">{String(failures())}</p>
            <For each={rows} by={(row) => row}>
              {(row) => (
                <li ref={row === 1 ? throwingRef(error) : undefined}>{row}</li>
              )}
            </For>
          </ul>
        );
      };
      createIsland({ root: container, component: App });
      flushScheduler();

      rows.set([2]);
      flushScheduler();
      await drainMicrotasks();
      flushScheduler();

      expect(reported()).toEqual([error]);
      expect(container.querySelector('#failures')!.textContent).toBe('1');
      expect(container.querySelectorAll('li')).toHaveLength(1);
    });

    it('should keep the update and log when reportError itself throws', async () => {
      const error = new Error('ref cleanup failed');
      const reporterFailure = new Error('reporter failed');
      reportError.mockImplementation(() => {
        throw reporterFailure;
      });
      let rows!: State<number[]>;
      const App = () => {
        rows = state([1, 2]);
        return (
          <ul>
            <p>static</p>
            <For each={rows} by={(row) => row}>
              {(row) => (
                <li ref={row === 1 ? throwingRef(error) : undefined}>{row}</li>
              )}
            </For>
          </ul>
        );
      };
      createIsland({ root: container, component: App });
      flushScheduler();

      rows.set([2]);
      flushScheduler();
      await drainMicrotasks();

      expect(
        Array.from(container.querySelectorAll('li'), (li) => li.textContent)
      ).toEqual(['2']);
      expect(reported()).toEqual([error]);
      expect(consoleError).toHaveBeenCalledWith(
        expect.any(String),
        error,
        reporterFailure
      );
    });

    it('should not route teardown failures through development-only warnings', async () => {
      const error = new Error('ref cleanup failed');
      const remove = mountToggle(() => <i ref={throwingRef(error)} />);

      remove();
      await drainMicrotasks();

      expect(reported()).toEqual([error]);
      expect(warn).not.toHaveBeenCalledWith(expect.any(String), error);
    });

    it('should report failures from a direct non-strict teardownNodeSubtree call', async () => {
      const first = new Error('first');
      const second = new Error('second');
      const sibling = vi.fn();
      mountToggle(() => (
        <section>
          <i ref={throwingRef(first)} />
          <b ref={sibling} />
          <u ref={throwingRef(second)} />
        </section>
      ));
      const section = container.querySelector('section')!;

      expect(() => teardownNodeSubtree(section)).not.toThrow();
      await drainMicrotasks();

      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(leavesOf(reported())).toEqual([first, second]);
    });

    it('should not call a throwing ref again on a second teardown pass', async () => {
      const error = new Error('ref cleanup failed');
      const ref = vi.fn(throwingRef(error));
      mountToggle(() => <i ref={ref} />);
      const element = container.querySelector('i')!;

      teardownNodeSubtree(element);
      teardownNodeSubtree(element);
      await drainMicrotasks();

      expect(ref.mock.calls.filter(([value]) => value === null)).toHaveLength(
        1
      );
      expect(reported()).toEqual([error]);
    });

    it('should throw every failure from strict teardownNodeSubtree without reporting', async () => {
      const first = new Error('first');
      const second = new Error('second');
      const sibling = vi.fn();
      mountToggle(() => (
        <section>
          <i ref={throwingRef(first)} />
          <b ref={sibling} />
          <u ref={throwingRef(second)} />
        </section>
      ));
      const section = container.querySelector('section')!;

      let thrown: unknown;
      try {
        teardownNodeSubtree(section, { strict: true });
      } catch (error) {
        thrown = error;
      }
      await drainMicrotasks();

      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as AggregateError).errors).toEqual([first, second]);
      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reportError).not.toHaveBeenCalled();
    });

    it('should report failures from a non-strict cleanupInstanceIfPresent call', async () => {
      const error = new Error('component cleanup failed');
      const siblingCleanup = vi.fn();
      const Failing = throwingCleanup(error, 'failing');
      const Sibling = trackedCleanup(siblingCleanup);
      mountToggle(
        () => (
          <section>
            <Failing />
            <Sibling />
          </section>
        ),
        true
      );
      const section = container.querySelector('section')!;

      expect(() => cleanupInstanceIfPresent(section)).not.toThrow();
      await drainMicrotasks();

      expect(siblingCleanup).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(leavesOf(reported())).toEqual([error]);
    });

    it('should report failures from removeAllListeners without throwing', async () => {
      const first = new Error('first');
      const second = new Error('second');
      const sibling = vi.fn();
      mountToggle(() => (
        <section>
          <i ref={throwingRef(first)} />
          <b ref={sibling} />
          <u ref={throwingRef(second)} />
        </section>
      ));

      expect(() =>
        removeAllListeners(container.querySelector('section'))
      ).not.toThrow();
      await drainMicrotasks();

      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(leavesOf(reported())).toEqual([first, second]);
    });

    it('should report listener failures from the keyed replace fast path', async () => {
      disableEventDelegation();
      const error = new Error('listener cleanup failed');
      let items!: State<number[]>;
      const App = () => {
        items = state(Array.from({ length: 200 }, (_, index) => index + 1));
        return (
          <ul>
            {items().map((id) => (
              <li key={id} data-id={String(id)} onClick={() => {}}>
                {String(id)}
              </li>
            ))}
          </ul>
        );
      };
      createIsland({ root: container, component: App });
      flushScheduler();
      const removed = container.querySelector('[data-id="1"]')!;
      removed.removeEventListener = () => {
        throw error;
      };

      items.set(items().slice(1).reverse());
      flushScheduler();
      await drainMicrotasks();

      expect(container.querySelectorAll('li')).toHaveLength(199);
      expect(container.querySelector('li')!.textContent).toBe('200');
      expect(reported()).toEqual([error]);
    });

    it('should report hydration-skipped binding failures without rolling back the update', async () => {
      const error = new Error('ref cleanup failed');
      const ref = throwingRef(error);
      let count!: State<number>;
      const App = () => {
        count = state(0);
        return (
          <main>
            <section data-skip-hydrate="true" ref={ref} />
            <p id="count">{String(count())}</p>
          </main>
        );
      };
      createIsland({ root: container, component: App });
      flushScheduler();

      count.set(1);
      flushScheduler();
      await drainMicrotasks();

      expect(container.querySelector('#count')!.textContent).toBe('1');
      expect(reported()).toEqual([error]);
    });

    it('should report teardown failures when a non-strict island is cleaned up', async () => {
      const error = new Error('ref cleanup failed');
      const sibling = vi.fn();
      mountToggle(() => (
        <section>
          <i ref={throwingRef(error)} />
          <b ref={sibling} />
        </section>
      ));

      expect(() => cleanupApp(container)).not.toThrow();
      await drainMicrotasks();

      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reported()).toEqual([error]);
    });

    it('should report non-strict root cleanup failures', async () => {
      const componentError = new Error('root component cleanup failed');
      const callbackError = new Error('root callback failed');
      const App = () => {
        registerMountOperation(() => () => {
          throw componentError;
        });
        return <main />;
      };
      createIsland({ root: container, component: App });
      flushScheduler();
      registerRootCleanupCallback(container, () => {
        throw callbackError;
      });

      expect(() => cleanupApp(container)).not.toThrow();
      await drainMicrotasks();

      expect(leavesOf(reported())).toEqual([componentError, callbackError]);
    });

    it('should throw descendant teardown failures from a strict island cleanup', async () => {
      const refError = new Error('ref cleanup failed');
      const componentError = new Error('component cleanup failed');
      const siblingCleanup = vi.fn();
      const Failing = () => {
        registerMountOperation(() => () => {
          throw componentError;
        });
        return <i ref={throwingRef(refError)} />;
      };
      const Sibling = trackedCleanup(siblingCleanup);
      mountToggle(
        () => (
          <section>
            <Failing />
            <Sibling />
          </section>
        ),
        true
      );

      let thrown: unknown;
      try {
        cleanupApp(container);
      } catch (error) {
        thrown = error;
      }
      await drainMicrotasks();

      expect(siblingCleanup).toHaveBeenCalledTimes(1);
      expect(reportError).not.toHaveBeenCalled();
      expect(thrown).toBeInstanceOf(AggregateError);
      const leaves = leavesOf([thrown]);
      expect(leaves).toContain(refError);
      expect(leaves).toContain(componentError);
    });

    it('should throw portal teardown failures from a strict island cleanup exactly once', async () => {
      const error = new Error('portal ref cleanup failed');
      const App = () => (
        <main>
          <DefaultPortal />
          <Portal>
            <i ref={throwingRef(error)} />
          </Portal>
        </main>
      );
      createIsland({ root: container, component: App, cleanupStrict: true });
      flushScheduler();

      let thrown: unknown;
      try {
        cleanupApp(container);
      } catch (caught) {
        thrown = caught;
      }
      await drainMicrotasks();

      expect(leavesOf([thrown])).toEqual([error]);
      expect(reportError).not.toHaveBeenCalled();
    });

    it('should throw For item component cleanup failures from a strict island cleanup', async () => {
      const error = new Error('item cleanup failed');
      const Item = throwingCleanup(error, 'item');
      const App = () => (
        <ul>
          <For each={[1]} by={(row) => row}>
            {() => <Item />}
          </For>
        </ul>
      );
      createIsland({ root: container, component: App, cleanupStrict: true });
      flushScheduler();

      let thrown: unknown;
      try {
        cleanupApp(container);
      } catch (caught) {
        thrown = caught;
      }
      await drainMicrotasks();

      expect(leavesOf([thrown])).toEqual([error]);
      expect(reportError).not.toHaveBeenCalled();
    });

    it('should throw Show branch component cleanup failures from a strict island cleanup', async () => {
      const error = new Error('branch cleanup failed');
      const Branch = throwingCleanup(error, 'branch');
      const App = () => (
        <main>
          <Show when={() => true}>
            <Branch />
          </Show>
        </main>
      );
      createIsland({ root: container, component: App, cleanupStrict: true });
      flushScheduler();

      let thrown: unknown;
      try {
        cleanupApp(container);
      } catch (caught) {
        thrown = caught;
      }
      await drainMicrotasks();

      expect(leavesOf([thrown])).toEqual([error]);
      expect(reportError).not.toHaveBeenCalled();
    });

    it('should report strict For item cleanup failures when an update removes the row', async () => {
      const error = new Error('item cleanup failed');
      const Item = throwingCleanup(error, 'item');
      let rows!: State<number[]>;
      const App = () => {
        rows = state([1, 2]);
        return (
          <ul>
            <For each={rows} by={(row) => row}>
              {(row) => (row === 1 ? <Item /> : <li>{row}</li>)}
            </For>
          </ul>
        );
      };
      createIsland({ root: container, component: App, cleanupStrict: true });
      flushScheduler();

      rows.set([2]);
      expect(() => flushScheduler()).not.toThrow();
      await drainMicrotasks();

      expect(
        Array.from(container.querySelectorAll('ul > *'), (el) => el.textContent)
      ).toEqual(['2']);
      expect(leavesOf(reported())).toEqual([error]);
    });
  }
);
