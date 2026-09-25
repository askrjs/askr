import { getOwnershipSignal, ownCleanup } from '../runtime/ownership/record';
import { enqueueRuntimeTask } from '../runtime';
import {
  captureLifecycleOwner,
  getCurrentComponentInstance,
  getCurrentLifecycleOwner,
  withLifecycleOwner,
} from '../runtime';
import type { OwnershipRecord } from '../runtime/ownership/record';
import { isPromiseLike } from '../common/promise';
import { reportUncaughtError } from '../common/report-error';
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
 * Schedule a user callback through the runtime scheduler. Its errors are
 * reported like a native listener's (reportError) so the rest of the flush
 * still runs.
 */
function enqueueUserCallback(fn: () => void) {
  enqueueRuntimeTask(() => {
    try {
      fn();
    } catch (err) {
      reportUncaughtError(err);
    }
  });
}

const noopRelease = (): void => {};

/**
 * Cancel scheduled work when the component whose committed lifecycle
 * (mount/commit operation, task, watch callback, or event handler) scheduled
 * it is cleaned up. Returns a release function for work that settles first.
 */
function cancelWithLifecycleOwner(
  owner: OwnershipRecord | null,
  cancel: () => void
): () => void {
  if (!owner) return noopRelease;
  const signal = getOwnershipSignal(owner);
  if (signal.aborted) {
    cancel();
    return noopRelease;
  }
  signal.addEventListener('abort', cancel, { once: true });
  return () => signal.removeEventListener('abort', cancel);
}

/** Run a wrapped handler later as the lifetime that received its event. */
function enqueueOwnedHandler(
  handler: EventListener,
  event: Event,
  owner: OwnershipRecord | null
): void {
  enqueueUserCallback(() =>
    withLifecycleOwner(owner, () => handler.call(null, event))
  );
}

function enqueueEventHandler(handler: EventListener): EventInvoke {
  return (_thisArg, [event, owner]) => {
    enqueueOwnedHandler(
      handler,
      event as Event,
      owner as OwnershipRecord | null
    );
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

  const resolveOwner = captureLifecycleOwner();
  const debouncer = createDebouncer(enqueueEventHandler(handler), ms, options);

  const debounced = function (this: unknown, ev: Event) {
    // Disallow using returned handler during render
    throwIfDuringRender();
    debouncer.call(null, [ev, resolveOwner()]);
  } as EventListener & { cancel(): void; flush(): void };

  debounced.cancel = debouncer.cancel;
  debounced.flush = debouncer.flush;

  // Auto-cleanup when the creating component (or committed work) unmounts
  const owner = inst?.owner ?? getCurrentLifecycleOwner();
  if (owner) ownCleanup(owner, debounced.cancel);

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

  const resolveOwner = captureLifecycleOwner();
  const throttler = createThrottler(enqueueEventHandler(handler), ms, options);

  const throttled = function (this: unknown, ev: Event) {
    throwIfDuringRender();
    throttler.call(null, [ev, resolveOwner()]);
  } as EventListener & { cancel(): void };

  throttled.cancel = throttler.cancel;

  const owner = inst?.owner ?? getCurrentLifecycleOwner();
  if (owner) ownCleanup(owner, throttled.cancel);

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

  const resolveOwner = captureLifecycleOwner();
  let frameId: RafHandle = null;
  let lastEvent: Event | null = null;
  let lastOwner: OwnershipRecord | null = null;

  const scheduleFrame = () => {
    const rAF =
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);

    frameId = rAF(() => {
      frameId = null;
      if (lastEvent) {
        const ev = lastEvent;
        const owner = lastOwner;
        lastEvent = null;
        lastOwner = null;
        enqueueOwnedHandler(handler, ev, owner);
      }
    });
  };

  const fn = function (this: unknown, ev: Event) {
    throwIfDuringRender();
    lastEvent = ev;
    lastOwner = resolveOwner();
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
    lastOwner = null;
  };

  const owner = inst?.owner ?? getCurrentLifecycleOwner();
  if (owner) ownCleanup(owner, fn.cancel);

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
  const owner = getCurrentLifecycleOwner();
  let release = noopRelease;
  let settled = false;
  const run = () => {
    if (settled) return;
    settled = true;
    release();
    withLifecycleOwner(owner, fn);
  };

  let id: TimeoutHandle = setTimeout(() => {
    id = null;
    enqueueUserCallback(run);
  }, ms);

  const cancel = () => {
    settled = true;
    if (id !== null) {
      clearTimeout(id);
      id = null;
    }
    release();
  };

  release = cancelWithLifecycleOwner(owner, cancel);
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
  const owner = getCurrentLifecycleOwner();
  let release = noopRelease;
  let settled = false;
  const run = () => {
    if (settled) return;
    settled = true;
    release();
    withLifecycleOwner(owner, fn);
  };

  let id: IdleHandle = null;
  let usingRIC = false;

  if (typeof requestIdleCallback !== 'undefined') {
    usingRIC = true;
    id = requestIdleCallback(() => {
      id = null;
      enqueueUserCallback(run);
    }, options);
  } else {
    // Fallback: schedule on next macrotask
    id = setTimeout(() => {
      id = null;
      enqueueUserCallback(run);
    }, 0);
  }

  const cancel = () => {
    settled = true;
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

  release = cancelWithLifecycleOwner(owner, cancel);
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

  const owner = getCurrentLifecycleOwner();
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
      let p: Promise<T>;
      try {
        p = withLifecycleOwner(owner, fn);
      } catch (e) {
        settle();
        reportUncaughtError(e);
        return;
      }
      if (!isPromiseLike(p)) {
        settle();
        return;
      }
      // The last attempt's rejection, like a throwing backoff(), has no
      // other observer, so it is reported rather than dropped.
      Promise.resolve(p)
        .then(settle, (error: unknown) => {
          if (cancelled) return;
          if (index + 1 < maxAttempts) {
            retryId = setTimeout(() => {
              attempt(index + 1);
            }, backoff(index));
          } else {
            settle();
            reportUncaughtError(error);
          }
        })
        .catch(reportUncaughtError);
    });
  };

  const cancel = () => {
    if (retryId !== null) {
      clearTimeout(retryId);
      retryId = null;
    }
    settle();
  };

  release = cancelWithLifecycleOwner(owner, cancel);

  // Start first attempt
  attempt(0);

  return { cancel };
}
