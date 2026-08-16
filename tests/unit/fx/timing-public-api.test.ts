import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import {
  defer,
  debounce,
  idle,
  once,
  raf,
  retry,
  throttle,
  timeout,
} from '@askrjs/askr/fx';

type FXGlobal = typeof globalThis & {
  requestAnimationFrame?: typeof requestAnimationFrame;
  requestIdleCallback?: typeof requestIdleCallback;
};

const fxGlobal = globalThis as FXGlobal;
const originalRequestAnimationFrame = fxGlobal.requestAnimationFrame;
const originalRequestIdleCallback = fxGlobal.requestIdleCallback;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  if (originalRequestAnimationFrame === undefined) {
    Reflect.deleteProperty(fxGlobal, 'requestAnimationFrame');
  } else {
    fxGlobal.requestAnimationFrame = originalRequestAnimationFrame;
  }

  if (originalRequestIdleCallback === undefined) {
    Reflect.deleteProperty(fxGlobal, 'requestIdleCallback');
  } else {
    fxGlobal.requestIdleCallback = originalRequestIdleCallback;
  }
});

describe('fx public timing helpers', () => {
  it('should invoke the first leading debounce call when the clock starts at zero', () => {
    vi.setSystemTime(0);
    const handler = vi.fn();
    const debounced = debounce(handler, 50, { leading: true });

    debounced('first');

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('first');
  });

  it('should not duplicate an isolated leading debounce call on the trailing edge', () => {
    const handler = vi.fn();
    const debounced = debounce(handler, 50, { leading: true, trailing: true });

    debounced('first');
    vi.advanceTimersByTime(50);

    expect(handler).toHaveBeenCalledOnce();
  });

  it('should invoke the trailing edge with the latest call after a leading debounce call', () => {
    const handler = vi.fn();
    const debounced = debounce(handler, 50, { leading: true, trailing: true });

    debounced('first');
    vi.advanceTimersByTime(10);
    debounced('second');
    vi.advanceTimersByTime(50);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, 'first');
    expect(handler).toHaveBeenNthCalledWith(2, 'second');
  });

  it.each([
    { leading: false, trailing: false, single: [], multiple: [] },
    { leading: false, trailing: true, single: ['first'], multiple: ['second'] },
    { leading: true, trailing: false, single: ['first'], multiple: ['first'] },
    {
      leading: true,
      trailing: true,
      single: ['first'],
      multiple: ['first', 'second'],
    },
  ])(
    'should honor leading=$leading trailing=$trailing for isolated and coalesced calls',
    ({ leading, trailing, single, multiple }) => {
      const isolatedHandler = vi.fn();
      const isolated = debounce(isolatedHandler, 50, { leading, trailing });
      isolated('first');
      vi.advanceTimersByTime(50);
      expect(isolatedHandler.mock.calls.flat()).toEqual(single);

      const coalescedHandler = vi.fn();
      const coalesced = debounce(coalescedHandler, 50, { leading, trailing });
      coalesced('first');
      vi.advanceTimersByTime(10);
      coalesced('second');
      vi.advanceTimersByTime(50);
      expect(coalescedHandler.mock.calls.flat()).toEqual(multiple);
    }
  );

  it('should invoke the first throttled call immediately even when the clock starts at zero', () => {
    vi.setSystemTime(0);

    const handler = vi.fn();
    const throttled = throttle(handler, 50);

    throttled('first');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('first');
  });

  it('should not schedule a duplicate trailing call after a single leading throttle invocation', () => {
    const handler = vi.fn();
    const throttled = throttle(handler, 50);

    throttled('first');
    vi.advanceTimersByTime(60);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('first');
  });

  it('should keep the latest arguments for the trailing throttle call inside the throttle interval', () => {
    vi.setSystemTime(100);

    const handler = vi.fn();
    const throttled = throttle(handler, 50);

    throttled('first');
    vi.advanceTimersByTime(10);
    throttled('second');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenNthCalledWith(1, 'first');

    vi.advanceTimersByTime(40);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(2, 'second');
  });

  it('should only execute once() callbacks a single time and reuse the first result', () => {
    const initialize = once((value: string) => value.toUpperCase());

    expect(initialize('first')).toBe('FIRST');
    expect(initialize('second')).toBe('FIRST');
  });

  it('should preserve the receiver for once() callbacks', () => {
    const receiver = {
      value: 'bound',
      initialize: once(function () {
        return this.value;
      }),
    };

    expect(receiver.initialize()).toBe('bound');
    expect(receiver.initialize()).toBe('bound');
  });

  it('should defer work onto the microtask queue', async () => {
    const handler = vi.fn();

    defer(handler);

    expect(handler).not.toHaveBeenCalled();

    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should coalesce raf() calls onto a single animation frame with the latest arguments', () => {
    const callbacks: FrameRequestCallback[] = [];
    fxGlobal.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });

    const handler = vi.fn((value: string) => value);
    const scheduled = raf(handler);

    scheduled('first');
    scheduled('second');

    expect(callbacks).toHaveLength(1);
    expect(handler).not.toHaveBeenCalled();

    callbacks[0]!(16);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('second');
  });

  it('should use requestIdleCallback when available and fall back to timeout when not', async () => {
    const requestIdle = vi.fn((callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 8 } as IdleDeadline);
      return 1;
    });
    fxGlobal.requestIdleCallback = requestIdle;

    const preferredHandler = vi.fn();
    idle(preferredHandler, { timeout: 25 });

    expect(requestIdle).toHaveBeenCalledTimes(1);
    expect(preferredHandler).toHaveBeenCalledTimes(1);

    Reflect.deleteProperty(fxGlobal, 'requestIdleCallback');

    const fallbackHandler = vi.fn();
    idle(fallbackHandler);

    expect(fallbackHandler).not.toHaveBeenCalled();

    await Promise.resolve();
    vi.advanceTimersByTime(0);

    expect(fallbackHandler).toHaveBeenCalledTimes(1);
  });

  it('should resolve timeout() after the requested delay', async () => {
    const resolved = vi.fn();
    const pending = timeout(25).then(resolved);

    vi.advanceTimersByTime(24);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await pending;

    expect(resolved).toHaveBeenCalledTimes(1);
  });

  it('should retry until success using the configured backoff', async () => {
    let attempts = 0;
    const operation = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error(`fail-${attempts}`);
      }
      return 'ok';
    });

    const pending = retry(operation, {
      maxAttempts: 3,
      delayMs: 10,
      backoff: () => 10,
    });

    expect(operation).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20);

    await expect(pending).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
