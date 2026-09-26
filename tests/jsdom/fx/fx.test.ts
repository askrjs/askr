import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import {
  debounceEvent,
  throttleEvent,
  rafEvent,
  scheduleTimeout,
  scheduleIdle,
  scheduleRetry,
} from '@askrjs/askr/fx';
import { createIsland, cleanupApp } from '@askrjs/askr/boot';
import { task } from '@askrjs/askr/resources';
import { renderToStringSync } from '@askrjs/askr/ssr';
import { flushScheduler } from '../../../test-utils/render/test-renderer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FX layer', () => {
  it('should schedule via scheduler (debounceEvent)', () => {
    const spy = vi.fn();
    const deb = debounceEvent(100, spy);

    // call twice quickly
    deb(new Event('x'));
    deb(new Event('x'));

    // Should have scheduled a setTimeout (not run immediately)
    expect(spy).not.toHaveBeenCalled();

    // Advance timers to trigger trailing
    vi.advanceTimersByTime(120);

    flushScheduler();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should coalesce and schedule via scheduler (rafEvent)', () => {
    const spy = vi.fn();
    const r = rafEvent(spy);

    r(new Event('x'));
    r(new Event('x'));

    // advance timers to simulate rAF fallback
    vi.advanceTimersByTime(20);

    flushScheduler();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should throttle and schedule via scheduler (throttleEvent)', () => {
    const spy = vi.fn();
    const t = throttleEvent(100, spy);

    t(new Event('x'));
    t(new Event('x'));

    // advance timers to trigger trailing
    vi.advanceTimersByTime(120);

    flushScheduler();
    expect(spy).toHaveBeenCalled();

    t.cancel();
  });

  it('should enqueue work and auto-cancel on unmount (scheduleTimeout)', () => {
    const target = document.createElement('div');
    const spy = vi.fn();
    createIsland({
      root: target,
      component: () => {
        task(() => {
          scheduleTimeout(100, spy);
        });
        return null;
      },
    });
    flushScheduler();
    cleanupApp(target);

    vi.advanceTimersByTime(120);
    // cancelled so not called
    flushScheduler();
    expect(spy).not.toHaveBeenCalled();
  });

  it('should use fallback and enqueue via scheduler (scheduleIdle)', () => {
    const spy = vi.fn();
    const cancel = scheduleIdle(spy);

    // fallback uses setTimeout(0)
    vi.advanceTimersByTime(0);

    flushScheduler();
    expect(spy).toHaveBeenCalled();

    cancel();
  });

  it('should enqueue attempts and be cancellable (scheduleRetry)', async () => {
    const attempts: number[] = [];
    let i = 0;
    const fn = vi.fn(() => {
      attempts.push(i);
      i++;
      return Promise.reject(new Error('fail'));
    });

    const cancelable = scheduleRetry(fn, { maxAttempts: 3, delayMs: 10 });

    // run timers to let retries schedule
    vi.advanceTimersByTime(1000);

    // Allow scheduler tasks to execute
    flushScheduler();

    // Because fn always rejects we expect multiple attempts scheduled (3)
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(1);

    cancelable.cancel();
  });

  it('should expose the final result of scheduleRetry', async () => {
    const scheduled = scheduleRetry(async () => 42);
    flushScheduler();
    await expect(scheduled.result).resolves.toEqual({
      status: 'success',
      value: 42,
    });
  });

  it('should expose cancellation of scheduleRetry', async () => {
    const scheduled = scheduleRetry(async () => 42);
    scheduled.cancel();
    await expect(scheduled.result).resolves.toEqual({ status: 'cancelled' });
  });

  it('should be inert during SSR (handlers)', () => {
    const spy = vi.fn();
    let deb!: EventListener;
    renderToStringSync(() => {
      deb = debounceEvent(100, spy);
      return null;
    });
    deb(new Event('x'));
    vi.advanceTimersByTime(200);
    flushScheduler();
    expect(spy).not.toHaveBeenCalled();
  });

  it('should throw when called during render (dev-only)', () => {
    // simulate render context
    const spy = vi.fn();
    const target = document.createElement('div');
    expect(() =>
      createIsland({
        root: target,
        component: () => {
          const deb = debounceEvent(100, spy);
          deb(new Event('x'));
          return null;
        },
      })
    ).toThrow();
  });
});

// Scheduled fx callbacks are handler-like: an exception is reported the way a
// native listener's is (reportError) and later scheduled work still runs.
describe('FX callback errors', () => {
  let reportError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should report scheduleTimeout callback errors through reportError', () => {
    const error = new Error('timeout failed');
    const after = vi.fn();
    scheduleTimeout(10, () => {
      throw error;
    });
    scheduleTimeout(10, after);

    vi.advanceTimersByTime(20);
    flushScheduler();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('should report scheduleIdle callback errors through reportError', () => {
    const error = new Error('idle failed');
    scheduleIdle(() => {
      throw error;
    });

    vi.advanceTimersByTime(0);
    flushScheduler();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error);
  });

  it('should report debounceEvent handler errors through reportError', () => {
    const error = new Error('debounced failed');
    const deb = debounceEvent(10, () => {
      throw error;
    });

    deb(new Event('x'));
    vi.advanceTimersByTime(20);
    flushScheduler();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error);
  });

  it('should report a synchronous scheduleRetry throw through reportError', () => {
    const error = new Error('retry failed');
    const fn = vi.fn((): Promise<void> => {
      throw error;
    });
    scheduleRetry(fn, { maxAttempts: 3, delayMs: 10 });

    flushScheduler();
    vi.advanceTimersByTime(1000);
    flushScheduler();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error);
  });

  it('should report the final scheduleRetry rejection through reportError', async () => {
    const errors = [new Error('first'), new Error('last')];
    let calls = 0;
    const fn = vi.fn(() => Promise.reject(errors[calls++]));
    const scheduled = scheduleRetry(fn, { maxAttempts: 2, delayMs: 10 });

    flushScheduler();
    await vi.advanceTimersByTimeAsync(10);
    flushScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(errors[1]);
    await expect(scheduled.result).resolves.toEqual({
      status: 'error',
      error: errors[1],
    });
  });

  it('should report a throwing scheduleRetry backoff through reportError', async () => {
    const error = new Error('backoff failed');
    const scheduled = scheduleRetry(
      () => Promise.reject(new Error('attempt')),
      {
        maxAttempts: 2,
        backoff: () => {
          throw error;
        },
      }
    );

    flushScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error);
    await expect(scheduled.result).resolves.toEqual({
      status: 'error',
      error,
    });
  });
});
