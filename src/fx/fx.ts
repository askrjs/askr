import { getOwnershipSignal, ownCleanup } from '../runtime/ownership/record';
import { enqueueRuntimeTask } from '../runtime';
import {
  getCurrentComponentInstance,
  getCurrentLifecycleOwner,
} from '../runtime';
import { logger } from '../common/logger';
import { noopEventListener, noopEventListenerWithFlush } from './noop';
import { createDebouncer, createThrottler } from './timing';

export type CancelFn = () => void;

// Platform-specific timer handle types
type TimeoutHandle = ReturnType<typeof setTimeout> | null;
type EventInvoke = (thisArg: unknown, args: unknown[]) => void;
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
  if (inst !== null) {
    throw new Error(
      '[Askr] calling FX handler during render is not allowed. Move calls to event handlers or effects.'
    );
  }
}

/**
 * Helper: schedule a user callback through the global scheduler
 */
function enqueueUserCallback(fn: () => void) {
  enqueueRuntimeTask(() => {
    try {
      fn();
    } catch (err) {
      // Keep behavior consistent with other scheduler-queued work
      logger.error('[Askr] FX handler error:', err);
    }
  });
}

const noopRelease = (): void => {};

/**
 * Cancel scheduled work when the component whose committed lifecycle
 * (mount/commit operation, task, watch callback, or event handler) scheduled
 * it is cleaned up. Returns a release function for work that settles first.
 */
function cancelWithLifecycleOwner(cancel: () => void): () => void {
  const owner = getCurrentLifecycleOwner();
  if (!owner) return noopRelease;
  const signal = getOwnershipSignal(owner);
  if (signal.aborted) {
    cancel();
    return noopRelease;
  }
  signal.addEventListener('abort', cancel, { once: true });
  return () => signal.removeEventListener('abort', cancel);
}

function enqueueEventHandler(handler: EventListener): EventInvoke {
  return (_thisArg, [event]) => {
    enqueueUserCallback(() => handler.call(null, event as Event));
  };
}

// ---------- Event handlers ----------

/** Wrap an event handler so rapid events are coalesced and delayed by `ms`. */
export function debounceEvent(
  ms: number,
  handler: EventListener,
  options?: { leading?: boolean; trailing?: boolean }
): EventListener & { cancel(): void; flush(): void } {
  const inst = getCurrentComponentInstance();
  // On SSR, event handlers are inert
  if (inst && inst.ssr) {
    return noopEventListenerWithFlush;
  }

  const debouncer = createDebouncer(enqueueEventHandler(handler), ms, options);

  const debounced = function (this: unknown, ev: Event) {
    // Disallow using returned handler during render
    throwIfDuringRender();
    debouncer.call(null, [ev]);
  } as EventListener & { cancel(): void; flush(): void };

  debounced.cancel = debouncer.cancel;
  debounced.flush = debouncer.flush;

  // Auto-cleanup on component unmount
  if (inst) {
    ownCleanup(inst.owner, () => {
      debounced.cancel();
    });
  }

  return debounced;
}

/** Wrap an event handler so it runs at most once per `ms` interval. */
export function throttleEvent(
  ms: number,
  handler: EventListener,
  options?: { leading?: boolean; trailing?: boolean }
): EventListener & { cancel(): void } {
  const inst = getCurrentComponentInstance();
  if (inst && inst.ssr) {
    return noopEventListener;
  }

  const throttler = createThrottler(enqueueEventHandler(handler), ms, options);

  const throttled = function (this: unknown, ev: Event) {
    throwIfDuringRender();
    throttler.call(null, [ev]);
  } as EventListener & { cancel(): void };

  throttled.cancel = throttler.cancel;

  if (inst) {
    ownCleanup(inst.owner, () => throttled.cancel());
  }

  return throttled;
}

/** Wrap an event handler so it runs at most once per animation frame, using the latest event. */
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

  if (inst) ownCleanup(inst.owner, () => fn.cancel());

  return fn;
}

// ---------- Scheduled work ----------

/**
 * Schedule `fn` after `ms`; returns a cancel function. Called from a mounted
 * component's task, watch callback, or event handler, it is also cancelled
 * when that component is cleaned up.
 */
export function scheduleTimeout(ms: number, fn: () => void): CancelFn {
  throwIfDuringRender();
  let release = noopRelease;

  let id: TimeoutHandle = setTimeout(() => {
    id = null;
    release();
    enqueueUserCallback(fn);
  }, ms);

  const cancel = () => {
    if (id !== null) {
      clearTimeout(id);
      id = null;
    }
    release();
  };

  release = cancelWithLifecycleOwner(cancel);
  return cancel;
}

/**
 * Schedule `fn` during browser idle time; returns a cancel function. Called
 * from a mounted component's task, watch callback, or event handler, it is
 * also cancelled when that component is cleaned up.
 */
export function scheduleIdle(
  fn: () => void,
  options?: { timeout?: number }
): CancelFn {
  throwIfDuringRender();
  let release = noopRelease;

  let id: IdleHandle = null;
  let usingRIC = false;

  if (typeof requestIdleCallback !== 'undefined') {
    usingRIC = true;
    id = requestIdleCallback(() => {
      id = null;
      release();
      enqueueUserCallback(fn);
    }, options);
  } else {
    // Fallback: schedule on next macrotask
    id = setTimeout(() => {
      id = null;
      release();
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
    release();
  };

  release = cancelWithLifecycleOwner(cancel);
  return cancel;
}

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: (attemptIndex: number) => number;
}

/**
 * Run `fn`, retrying with backoff on failure. Called from a mounted
 * component's task, watch callback, or event handler, pending attempts are
 * also cancelled when that component is cleaned up.
 */
export function scheduleRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): { cancel(): void } {
  throwIfDuringRender();

  const {
    maxAttempts = 3,
    delayMs = 100,
    backoff = (i: number) => delayMs * Math.pow(2, i),
  } = options || {};

  let cancelled = false;
  let retryId: TimeoutHandle = null;
  let release = noopRelease;

  const settle = () => {
    cancelled = true;
    release();
  };

  const attempt = (index: number) => {
    retryId = null;
    if (cancelled) return;
    // Run user fn inside scheduler
    enqueueRuntimeTask(() => {
      if (cancelled) return;
      // Call fn (it may be async)
      const p = fn();
      p.then(settle, () => {
        if (cancelled) return;
        if (index + 1 < maxAttempts) {
          retryId = setTimeout(() => {
            attempt(index + 1);
          }, backoff(index));
        } else {
          settle();
        }
      }).catch((e) => {
        logger.error('[Askr] scheduleRetry error:', e);
      });
    });
  };

  const cancel = () => {
    if (retryId !== null) {
      clearTimeout(retryId);
      retryId = null;
    }
    settle();
  };

  release = cancelWithLifecycleOwner(cancel);

  // Start first attempt
  attempt(0);

  return { cancel };
}
