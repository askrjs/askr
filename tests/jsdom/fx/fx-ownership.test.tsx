import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp, createIsland } from '@askrjs/askr/boot';
import { state, type State } from '@askrjs/askr';
import { task, watch } from '@askrjs/askr/resources';
import {
  debounceEvent,
  scheduleIdle,
  scheduleRetry,
  scheduleTimeout,
  throttleEvent,
} from '@askrjs/askr/fx';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
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
});
