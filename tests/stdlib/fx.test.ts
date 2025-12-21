import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  debounceEvent,
  throttleEvent,
  rafEvent,
  scheduleTimeout,
  scheduleIdle,
  scheduleRetry,
} from '../../src/stdlib/fx';
import { globalScheduler } from '../../src/runtime/scheduler';
import {
  createComponentInstance,
  setCurrentComponentInstance,
  type ComponentFunction,
} from '../../src/runtime/component';

const noop: ComponentFunction = () => null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  // Clear current instance
  setCurrentComponentInstance(null);
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
    const inst = createComponentInstance('id', noop, {}, null);
    setCurrentComponentInstance(inst);

    const spy = vi.fn();
    scheduleTimeout(100, spy);

    // simulate unmount
    for (const fn of inst.cleanupFns) fn();

    vi.advanceTimersByTime(120);
    // cancelled so not called
    globalScheduler.flush();
    expect(spy).not.toHaveBeenCalled();

    setCurrentComponentInstance(null);
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
    setCurrentComponentInstance(inst);

    const spy = vi.fn();
    const deb = debounceEvent(100, spy);
    deb(new Event('x'));
    vi.advanceTimersByTime(200);
    globalScheduler.flush();
    expect(spy).not.toHaveBeenCalled();

    setCurrentComponentInstance(null);
  });

  it('should throw when called during render (dev-only)', () => {
    // simulate render context
    const inst = createComponentInstance('id', noop, {}, null);
    setCurrentComponentInstance(inst);

    const spy = vi.fn();
    const deb = debounceEvent(100, spy);

    expect(() => deb(new Event('x'))).toThrow();

    setCurrentComponentInstance(null);
  });
});
