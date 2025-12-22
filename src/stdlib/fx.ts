import { globalScheduler } from '../runtime/scheduler';
import { getCurrentComponentInstance } from '../runtime/component';
import { logger } from '../dev/logger';
import { noopEventListener, noopEventListenerWithFlush } from './noop';

export type CancelFn = () => void;

// Platform-specific timer handle types
type TimeoutHandle = ReturnType<typeof setTimeout> | null;
// rAF may fall back to setTimeout in some environments/tests, include both
type RafHandle =
  | ReturnType<typeof requestAnimationFrame>
  | ReturnType<typeof setTimeout>
  | null;
// requestIdleCallback may be unavailable; allow setTimeout fallback handle
type IdleHandle =
  | ReturnType<typeof requestIdleCallback>
  | ReturnType<typeof setTimeout>
  | null;

function throwIfDuringRender(): void {
  const inst = getCurrentComponentInstance();
  if (inst !== null && process.env.NODE_ENV !== 'production') {
    throw new Error(
      '[Askr] calling FX handler during render is not allowed. Move calls to event handlers or effects.'
    );
  }
}

/**
 * Helper: schedule a user callback through the global scheduler
 */
function enqueueUserCallback(fn: () => void) {
  globalScheduler.enqueue(() => {
    try {
      fn();
    } catch (err) {
      // Keep behavior consistent with other scheduler-queued work
      logger.error('[Askr] FX handler error:', err);
    }
  });
}

// ---------- Event handlers ----------

export function debounceEvent(
  ms: number,
  handler: EventListener,
  options?: { leading?: boolean; trailing?: boolean }
): EventListener & { cancel(): void; flush(): void } {
  const { leading = false, trailing = true } = options || {};

  const inst = getCurrentComponentInstance();
  // On SSR, event handlers are inert
  if (inst && inst.ssr) {
    return noopEventListenerWithFlush;
  }

  let timeoutId: TimeoutHandle = null;
  let lastEvent: Event | null = null;
  let lastCallTime = 0;

  const debounced = function (this: unknown, ev: Event) {
    // Disallow using returned handler during render
    throwIfDuringRender();

    const now = Date.now();
    lastEvent = ev;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (leading && now - lastCallTime >= ms) {
      enqueueUserCallback(() => handler.call(null, ev));
      lastCallTime = now;
    }

    if (trailing) {
      timeoutId = setTimeout(() => {
        // Schedule through scheduler
        if (lastEvent) {
          enqueueUserCallback(() => handler.call(null, lastEvent!));
        }
        timeoutId = null;
        lastCallTime = Date.now();
      }, ms);
    }
  } as EventListener & { cancel(): void; flush(): void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastEvent = null;
  };

  debounced.flush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      const ev = lastEvent;
      lastEvent = null;
      timeoutId = null;
      if (ev) enqueueUserCallback(() => handler.call(null, ev));
    }
  };

  // Auto-cleanup on component unmount
  if (inst) {
    inst.cleanupFns.push(() => {
      debounced.cancel();
    });
  }

  return debounced;
}

export function throttleEvent(
  ms: number,
  handler: EventListener,
  options?: { leading?: boolean; trailing?: boolean }
): EventListener & { cancel(): void } {
  const { leading = true, trailing = true } = options || {};

  const inst = getCurrentComponentInstance();
  if (inst && inst.ssr) {
    return noopEventListener;
  }

  let lastCallTime = 0;
  let timeoutId: TimeoutHandle = null;
  let lastEvent: Event | null = null;

  const throttled = function (this: unknown, ev: Event) {
    throwIfDuringRender();

    const now = Date.now();
    lastEvent = ev;

    if (leading && now - lastCallTime >= ms) {
      enqueueUserCallback(() => handler.call(null, ev));
      lastCallTime = now;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    } else if (!leading && lastCallTime === 0) {
      lastCallTime = now;
    }

    if (trailing && timeoutId === null) {
      const wait = ms - (now - lastCallTime);
      timeoutId = setTimeout(
        () => {
          if (lastEvent)
            enqueueUserCallback(() => handler.call(null, lastEvent!));
          lastCallTime = Date.now();
          timeoutId = null;
        },
        Math.max(0, wait)
      );
    }
  } as EventListener & { cancel(): void };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastEvent = null;
  };

  if (inst) {
    inst.cleanupFns.push(() => throttled.cancel());
  }

  return throttled;
}

export function rafEvent(
  handler: EventListener
): EventListener & { cancel(): void } {
  const inst = getCurrentComponentInstance();
  if (inst && inst.ssr) {
    return noopEventListener;
  }

  let frameId: RafHandle = null;
  let lastEvent: Event | null = null;

  const scheduleFrame = () => {
    const rAF =
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);

    frameId = rAF(() => {
      frameId = null;
      if (lastEvent) {
        const ev = lastEvent;
        lastEvent = null;
        enqueueUserCallback(() => handler.call(null, ev));
      }
    });
  };

  const fn = function (this: unknown, ev: Event) {
    throwIfDuringRender();
    lastEvent = ev;
    if (frameId === null) scheduleFrame();
  } as EventListener & { cancel(): void };

  fn.cancel = () => {
    if (frameId !== null) {
      // If frameId is numeric and cancelAnimationFrame is available, use it;
      // otherwise fall back to clearTimeout for the setTimeout fallback.
      if (
        typeof cancelAnimationFrame !== 'undefined' &&
        typeof frameId === 'number'
      ) {
        cancelAnimationFrame(frameId);
      } else {
        clearTimeout(frameId as ReturnType<typeof setTimeout>);
      }
      frameId = null;
    }
    lastEvent = null;
  };

  if (inst) inst.cleanupFns.push(() => fn.cancel());

  return fn;
}

// ---------- Scheduled work ----------

export function scheduleTimeout(ms: number, fn: () => void): CancelFn {
  const inst = getCurrentComponentInstance();
  if (inst && inst.ssr) {
    return () => {};
  }

  let id: TimeoutHandle = setTimeout(() => {
    id = null;
    enqueueUserCallback(fn);
  }, ms);

  const cancel = () => {
    if (id !== null) {
      clearTimeout(id);
      id = null;
    }
  };

  if (inst) inst.cleanupFns.push(cancel);
  return cancel;
}

export function scheduleIdle(
  fn: () => void,
  options?: { timeout?: number }
): CancelFn {
  const inst = getCurrentComponentInstance();
  if (inst && inst.ssr) return () => {};

  let id: IdleHandle = null;
  let usingRIC = false;

  if (typeof requestIdleCallback !== 'undefined') {
    usingRIC = true;
    id = requestIdleCallback(() => {
      id = null;
      enqueueUserCallback(fn);
    }, options);
  } else {
    // Fallback: schedule on next macrotask
    id = setTimeout(() => {
      id = null;
      enqueueUserCallback(fn);
    }, 0);
  }

  const cancel = () => {
    if (id !== null) {
      // If using requestIdleCallback and available, call cancelIdleCallback for numeric ids.
      if (
        usingRIC &&
        typeof cancelIdleCallback !== 'undefined' &&
        typeof id === 'number'
      ) {
        cancelIdleCallback(id);
      } else {
        clearTimeout(id as ReturnType<typeof setTimeout>);
      }
      id = null;
    }
  };

  if (inst) inst.cleanupFns.push(cancel);
  return cancel;
}

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: (attemptIndex: number) => number;
}

export function scheduleRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): { cancel(): void } {
  const inst = getCurrentComponentInstance();
  if (inst && inst.ssr) return { cancel: () => {} };

  const {
    maxAttempts = 3,
    delayMs = 100,
    backoff = (i: number) => delayMs * Math.pow(2, i),
  } = options || {};

  let cancelled = false;

  const attempt = (index: number) => {
    if (cancelled) return;
    // Run user fn inside scheduler
    globalScheduler.enqueue(() => {
      if (cancelled) return;
      // Call fn (it may be async)
      const p = fn();
      p.then(
        () => {
          // Completed successfully
        },
        () => {
          if (cancelled) return;
          if (index + 1 < maxAttempts) {
            const delay = backoff(index);
            // Schedule next attempt via setTimeout so it gets enqueued through scheduleTimeout
            setTimeout(() => {
              attempt(index + 1);
            }, delay);
          }
        }
      ).catch((e) => {
        logger.error('[Askr] scheduleRetry error:', e);
      });
    });
  };

  // Start first attempt
  attempt(0);

  const cancel = () => {
    cancelled = true;
  };

  if (inst) inst.cleanupFns.push(cancel);
  return { cancel };
}
