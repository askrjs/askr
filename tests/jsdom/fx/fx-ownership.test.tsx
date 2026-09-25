import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp, createIsland } from '@askrjs/askr/boot';
import { Show, state, type State } from '@askrjs/askr';
import { task, watch } from '@askrjs/askr/resources';
import {
  debounceEvent,
  rafEvent,
  scheduleEventHandler,
  scheduleIdle,
  scheduleRetry,
  scheduleTimeout,
  throttle,
  throttleEvent,
} from '@askrjs/askr/fx';
import { definePortal } from '../../../src/foundations/structures/portal';
import {
  enqueueRuntimeTask,
  flushRuntimeScheduler,
} from '../../../src/runtime';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function settle(ms: number): void {
  vi.advanceTimersByTime(ms);
  flushScheduler();
}

describe('fx scheduled work ownership', () => {
  it('should cancel scheduleTimeout from a task when the component unmounts', () => {
    const { container, cleanup } = createTestContainer();
    const fired = vi.fn();

    createIsland({
      root: container,
      component: () => {
        task(() => {
          scheduleTimeout(100, fired);
        });
        return <div>{'mounted'}</div>;
      },
    });
    flushScheduler();

    cleanupApp(container);
    settle(200);

    expect(fired).not.toHaveBeenCalled();
    cleanup();
  });

  it('should cancel scheduleIdle from a task when the component unmounts', () => {
    const { container, cleanup } = createTestContainer();
    const fired = vi.fn();

    createIsland({
      root: container,
      component: () => {
        task(() => {
          scheduleIdle(fired);
        });
        return <div>{'mounted'}</div>;
      },
    });
    flushScheduler();

    cleanupApp(container);
    settle(50);

    expect(fired).not.toHaveBeenCalled();
    cleanup();
  });

  it('should stop scheduleRetry attempts from a task when the component unmounts', async () => {
    const { container, cleanup } = createTestContainer();
    const attempt = vi.fn(() => Promise.reject(new Error('fail')));

    createIsland({
      root: container,
      component: () => {
        task(() => {
          scheduleRetry(attempt, { maxAttempts: 3, delayMs: 10 });
        });
        return <div>{'mounted'}</div>;
      },
    });
    flushScheduler();
    await vi.advanceTimersByTimeAsync(0);
    expect(attempt).toHaveBeenCalledTimes(1);

    cleanupApp(container);
    await vi.advanceTimersByTimeAsync(1000);
    flushScheduler();

    expect(attempt).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('should cancel scheduleTimeout from a watch callback when the component unmounts', () => {
    const { container, cleanup } = createTestContainer();
    const fired = vi.fn();
    let count!: State<number>;

    createIsland({
      root: container,
      component: () => {
        count = state(0);
        watch(count, (value) => {
          if (value > 0) scheduleTimeout(100, fired);
        });
        return <output>{() => count()}</output>;
      },
    });
    flushScheduler();
    count.set(1);
    flushScheduler();

    cleanupApp(container);
    settle(200);

    expect(fired).not.toHaveBeenCalled();
    cleanup();
  });

  it.each([
    ['delegated', 'onClick'],
    ['direct', 'onClickCapture'],
  ] as const)(
    'should cancel scheduleTimeout from a %s event handler when the component unmounts',
    (_mode, prop) => {
      const { container, cleanup } = createTestContainer();
      const fired = vi.fn();
      const handler = () => {
        scheduleTimeout(100, fired);
      };

      createIsland({
        root: container,
        component: () => <button {...{ [prop]: handler }}>{'go'}</button>,
      });
      flushScheduler();
      container.querySelector('button')!.click();
      flushScheduler();

      cleanupApp(container);
      settle(200);

      expect(fired).not.toHaveBeenCalled();
      cleanup();
    }
  );

  it('should still fire owned scheduled work while the component stays mounted', () => {
    const { container, cleanup } = createTestContainer();
    const fired = vi.fn();

    createIsland({
      root: container,
      component: () => {
        task(() => {
          scheduleTimeout(100, fired);
        });
        return (
          <button onClick={() => scheduleTimeout(100, fired)}>{'go'}</button>
        );
      },
    });
    flushScheduler();
    container.querySelector('button')!.click();
    settle(200);

    expect(fired).toHaveBeenCalledTimes(2);
    cleanupApp(container);
    cleanup();
  });
  it('should cancel scheduleTimeout from a portal handler when the writer unmounts', () => {
    const { container, cleanup } = createTestContainer();
    const fired = vi.fn();
    const Overlay = definePortal();
    let show!: State<boolean>;

    function Writer() {
      return Overlay.render({
        children: (
          <button
            id="portal-button"
            onClick={() => scheduleTimeout(100, fired)}
          >
            {'go'}
          </button>
        ),
      });
    }

    createIsland({
      root: container,
      component: () => {
        show = state(true);
        return (
          <div>
            <Overlay />
            <Show when={() => show()}>
              <Writer />
            </Show>
          </div>
        );
      },
    });
    flushScheduler();
    (container.querySelector('#portal-button') as HTMLElement).click();
    flushScheduler();

    show.set(false);
    flushScheduler();
    settle(200);

    expect(fired).not.toHaveBeenCalled();
    cleanupApp(container);
    cleanup();
  });

  it.each([
    ['delegated', 'onClick'],
    ['direct', 'onClickCapture'],
  ] as const)(
    'should move a stable %s portal handler to the writer that takes over',
    (_mode, prop) => {
      const { container, cleanup } = createTestContainer();
      const fired = vi.fn();
      const Overlay = definePortal();
      let showA!: State<boolean>;
      let showB!: State<boolean>;
      const handler = () => {
        scheduleTimeout(100, fired);
      };
      const content = () => (
        <button id="portal-button" {...{ [prop]: handler }}>
          {'go'}
        </button>
      );
      const A = () => Overlay.render({ children: content() });
      const B = () => Overlay.render({ children: content() });

      createIsland({
        root: container,
        component: () => {
          showA = state(true);
          showB = state(false);
          return (
            <div>
              <Overlay />
              <Show when={() => showA()}>
                <A />
              </Show>
              <Show when={() => showB()}>
                <B />
              </Show>
            </div>
          );
        },
      });
      flushScheduler();
      showB.set(true);
      flushScheduler();
      showA.set(false);
      flushScheduler();

      const button = () =>
        container.querySelector('#portal-button') as HTMLElement;
      button().click();
      settle(200);
      expect(fired).toHaveBeenCalledTimes(1);

      button().click();
      flushScheduler();
      showB.set(false);
      flushScheduler();
      settle(200);
      expect(fired).toHaveBeenCalledTimes(1);

      cleanupApp(container);
      cleanup();
    }
  );

  it('should stop a polling loop rescheduled from its own callback on unmount', () => {
    const { container, cleanup } = createTestContainer();
    const tick = vi.fn();
    let show!: State<boolean>;

    function Poller() {
      task(() => {
        const loop = () => {
          tick();
          scheduleTimeout(100, loop);
        };
        scheduleTimeout(100, loop);
      });
      return <span />;
    }

    createIsland({
      root: container,
      component: () => {
        show = state(true);
        return (
          <div>
            <Show when={() => show()}>
              <Poller />
            </Show>
          </div>
        );
      },
    });
    flushScheduler();
    settle(150);
    expect(tick).toHaveBeenCalledTimes(1);

    show.set(false);
    flushScheduler();
    settle(1000);

    expect(tick).toHaveBeenCalledTimes(1);
    cleanupApp(container);
    cleanup();
  });

  it('should own scheduleTimeout called from a scheduleRetry attempt', async () => {
    const { container, cleanup } = createTestContainer();
    const fired = vi.fn();
    let show!: State<boolean>;

    function Retrier() {
      task(() => {
        scheduleRetry(async () => {
          scheduleTimeout(100, fired);
        });
      });
      return <span />;
    }

    createIsland({
      root: container,
      component: () => {
        show = state(true);
        return (
          <div>
            <Show when={() => show()}>
              <Retrier />
            </Show>
          </div>
        );
      },
    });
    flushScheduler();
    show.set(false);
    flushScheduler();
    await vi.advanceTimersByTimeAsync(200);
    flushScheduler();

    expect(fired).not.toHaveBeenCalled();
    cleanupApp(container);
    cleanup();
  });

  it('should cancel a pending debounceEvent created in a task on unmount', () => {
    const { container, cleanup } = createTestContainer();
    const ran = vi.fn();
    let debounced!: EventListener;
    let show!: State<boolean>;

    function Source() {
      task(() => {
        debounced = debounceEvent(10, ran);
      });
      return <span />;
    }

    createIsland({
      root: container,
      component: () => {
        show = state(true);
        return (
          <div>
            <Show when={() => show()}>
              <Source />
            </Show>
          </div>
        );
      },
    });
    flushScheduler();
    debounced(new Event('x'));
    show.set(false);
    flushScheduler();
    settle(50);

    expect(ran).not.toHaveBeenCalled();
    cleanupApp(container);
    cleanup();
  });

  it('should not attribute unrelated queued work to a handler that flushes synchronously', () => {
    const { container, cleanup } = createTestContainer();
    const fired = vi.fn();

    createIsland({
      root: container,
      component: () => (
        <button onClick={() => flushRuntimeScheduler()}>{'go'}</button>
      ),
    });
    flushScheduler();

    // Queued by unrelated code before the click; it must not become owned
    // by the clicked component when the handler flushes the scheduler.
    enqueueRuntimeTask(() => {
      scheduleTimeout(100, fired);
    });
    container.querySelector('button')!.click();
    cleanupApp(container);
    settle(200);

    expect(fired).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it.each([
    [
      'throws synchronously',
      (): Promise<void> => {
        throw new Error('sync');
      },
    ],
    [
      'returns a non-promise',
      (() => undefined) as unknown as () => Promise<void>,
    ],
  ])(
    'should release the scheduleRetry owner listener when fn %s',
    (_label, fn) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const add = vi.spyOn(AbortSignal.prototype, 'addEventListener');
      const remove = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
      const attempt = vi.fn(fn);
      const { container, cleanup } = createTestContainer();

      createIsland({
        root: container,
        component: () => (
          <button onClick={() => scheduleRetry(attempt, { maxAttempts: 3 })}>
            {'go'}
          </button>
        ),
      });
      flushScheduler();
      add.mockClear();
      remove.mockClear();

      container.querySelector('button')!.click();
      settle(1000);

      expect(attempt).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);
      cleanupApp(container);
      cleanup();
    }
  );

  it.each([
    ['debounceEvent', (h: EventListener) => debounceEvent(10, h)],
    ['throttleEvent', (h: EventListener) => throttleEvent(10, h)],
    ['rafEvent', (h: EventListener) => rafEvent(h)],
    ['scheduleEventHandler', (h: EventListener) => scheduleEventHandler(h)],
  ] as const)(
    'should own scheduleTimeout called from a %s-wrapped handler',
    (_label, wrap) => {
      const { container, cleanup } = createTestContainer();
      const fired = vi.fn();

      createIsland({
        root: container,
        component: () => {
          const handler = wrap(() => {
            scheduleTimeout(100, fired);
          });
          return <button onClick={handler}>{'go'}</button>;
        },
      });
      flushScheduler();
      container.querySelector('button')!.click();
      settle(20);

      cleanupApp(container);
      settle(200);

      expect(fired).not.toHaveBeenCalled();
      cleanup();
    }
  );

  it('should own scheduleTimeout from a handler wrapped in a task and attached natively', () => {
    const { container, cleanup } = createTestContainer();
    const fired = vi.fn();

    createIsland({
      root: container,
      component: () => {
        task(() => {
          const listener = scheduleEventHandler(() => {
            scheduleTimeout(100, fired);
          });
          container.addEventListener('custom', listener);
          return () => container.removeEventListener('custom', listener);
        });
        return <div>{'mounted'}</div>;
      },
    });
    flushScheduler();
    const listener = vi.fn();
    container.addEventListener('custom', listener);
    container.dispatchEvent(new Event('custom'));
    flushScheduler();

    cleanupApp(container);
    settle(200);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(fired).not.toHaveBeenCalled();
    cleanup();
  });
});

describe('fx event helper edges', () => {
  it('should call a leading debounceEvent handler once for a single event', () => {
    const handler = vi.fn();
    const debounced = debounceEvent(100, handler, { leading: true });

    debounced(new Event('x'));
    settle(200);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should replay only the latest follow-up event on the leading debounceEvent trailing edge', () => {
    const handler = vi.fn();
    const debounced = debounceEvent(100, handler, { leading: true });
    const first = new Event('first');
    const second = new Event('second');

    debounced(first);
    settle(50);
    debounced(second);
    settle(200);

    expect(handler.mock.calls.map(([event]) => event)).toEqual([first, second]);
  });

  it('should call a default throttleEvent handler once for a single event', () => {
    const handler = vi.fn();
    const throttled = throttleEvent(100, handler);

    throttled(new Event('x'));
    settle(200);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should call a default throttleEvent handler on both edges for a burst', () => {
    const handler = vi.fn();
    const throttled = throttleEvent(100, handler);
    const first = new Event('first');
    const last = new Event('last');

    throttled(first);
    throttled(new Event('middle'));
    throttled(last);
    settle(200);

    expect(handler.mock.calls.map(([event]) => event)).toEqual([first, last]);
  });

  it('should flush only a pending trailing debounceEvent call', () => {
    const handler = vi.fn();
    const debounced = debounceEvent(100, handler, { leading: true });

    debounced(new Event('x'));
    flushScheduler();
    debounced.flush();
    flushScheduler();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should wait a full interval after an idle gap when throttle has no leading edge', () => {
    const handler = vi.fn();
    const throttled = throttle(handler, 100, { leading: false });

    throttled('first');
    vi.advanceTimersByTime(100);
    expect(handler).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(500);
    throttled('second');
    vi.advanceTimersByTime(50);
    expect(handler).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(handler).toHaveBeenLastCalledWith('second');
  });
});
