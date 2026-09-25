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
} from '../../../src/fx/fx';
import { globalScheduler } from '../../../src/runtime/scheduler';
import {
  cleanupComponent,
  createComponentInstance,
  mountInstanceInline,
  registerMountOperation,
  beginComponentScope,
  type ComponentFunction,
} from '../../../src/runtime';

const noop: ComponentFunction = () => null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  // Clear current instance
  beginComponentScope({ instance: null });
});

describe('FX layer', () => {
  it('should schedule via scheduler (debounceEvent)', () => {
    const spy = vi.fn();
    const deb = debounceEvent(100, spy);

    const enqueueSpy = vi.spyOn(globalScheduler, 'enqueue');

    // call twice quickly
    deb(new Event('x'));
    deb(new Event('x'));

    // Should have scheduled a setTimeout (not run immediately)
    expect(spy).not.toHaveBeenCalled();

    // Advance timers to trigger trailing
    vi.advanceTimersByTime(120);

    // The timer callback should enqueue the handler
    expect(enqueueSpy).toHaveBeenCalled();

    // Run scheduler to execute enqueued task
    globalScheduler.flush();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should coalesce and schedule via scheduler (rafEvent)', () => {
    const spy = vi.fn();
    const r = rafEvent(spy);
    const enqueueSpy = vi.spyOn(globalScheduler, 'enqueue');

    r(new Event('x'));
    r(new Event('x'));

    // advance timers to simulate rAF fallback
    vi.advanceTimersByTime(20);

    expect(enqueueSpy).toHaveBeenCalled();
    globalScheduler.flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should throttle and schedule via scheduler (throttleEvent)', () => {
    const spy = vi.fn();
    const t = throttleEvent(100, spy);
    const enqueueSpy = vi.spyOn(globalScheduler, 'enqueue');

    t(new Event('x'));
    t(new Event('x'));

    // advance timers to trigger trailing
    vi.advanceTimersByTime(120);

    expect(enqueueSpy).toHaveBeenCalled();
    globalScheduler.flush();
    expect(spy).toHaveBeenCalled();

    t.cancel();
  });

  it('should enqueue work and auto-cancel on unmount (scheduleTimeout)', () => {
    const target = document.createElement('div');
    const inst = createComponentInstance('id', noop, {}, target);
    inst.isRoot = true;

    const spy = vi.fn();

    // FX scheduling must not happen during render.
    // Simulate an effect/mount operation that runs after the first commit.
    beginComponentScope({ instance: inst });
    // The mount operation does not return `cancel`; unmount alone must cancel.
    registerMountOperation(() => {
      scheduleTimeout(100, spy);
    });
    beginComponentScope({ instance: null });

    // First mount executes mount operations and records cleanup.
    mountInstanceInline(inst, target);

    cleanupComponent(inst);

    vi.advanceTimersByTime(120);
    // cancelled so not called
    globalScheduler.flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it('should use fallback and enqueue via scheduler (scheduleIdle)', () => {
    const spy = vi.fn();
    const enqueueSpy = vi.spyOn(globalScheduler, 'enqueue');
    const cancel = scheduleIdle(spy);

    // fallback uses setTimeout(0)
    vi.advanceTimersByTime(0);

    expect(enqueueSpy).toHaveBeenCalled();
    globalScheduler.flush();
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
    globalScheduler.flush();

    // Because fn always rejects we expect multiple attempts scheduled (3)
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(1);

    cancelable.cancel();
  });

  it('should be inert during SSR (handlers)', () => {
    const inst = createComponentInstance('id', noop, {}, null);
    inst.ssr = true;
    beginComponentScope({ instance: inst });

    const spy = vi.fn();
    const deb = debounceEvent(100, spy);
    deb(new Event('x'));
    vi.advanceTimersByTime(200);
    globalScheduler.flush();
    expect(spy).not.toHaveBeenCalled();

    beginComponentScope({ instance: null });
  });

  it('should throw when called during render (dev-only)', () => {
    // simulate render context
    const inst = createComponentInstance('id', noop, {}, null);
    beginComponentScope({ instance: inst });

    const spy = vi.fn();
    const deb = debounceEvent(100, spy);

    expect(() => deb(new Event('x'))).toThrow();

    beginComponentScope({ instance: null });
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
    globalScheduler.flush();

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
    globalScheduler.flush();

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
    globalScheduler.flush();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error);
  });

  it('should report a synchronous scheduleRetry throw through reportError', () => {
    const error = new Error('retry failed');
    const fn = vi.fn((): Promise<void> => {
      throw error;
    });
    scheduleRetry(fn, { maxAttempts: 3, delayMs: 10 });

    globalScheduler.flush();
    vi.advanceTimersByTime(1000);
    globalScheduler.flush();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error);
  });

  it('should report the final scheduleRetry rejection through reportError', async () => {
    const errors = [new Error('first'), new Error('last')];
    let calls = 0;
    const fn = vi.fn(() => Promise.reject(errors[calls++]));
    scheduleRetry(fn, { maxAttempts: 2, delayMs: 10 });

    globalScheduler.flush();
    await vi.advanceTimersByTimeAsync(10);
    globalScheduler.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(errors[1]);
  });

  it('should report a throwing scheduleRetry backoff through reportError', async () => {
    const error = new Error('backoff failed');
    scheduleRetry(() => Promise.reject(new Error('attempt')), {
      maxAttempts: 2,
      backoff: () => {
        throw error;
      },
    });

    globalScheduler.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error);
  });
});
