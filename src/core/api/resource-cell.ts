import { isProductionEnvironment } from '../../common/env';
import { logger } from '../../common/logger';
import { throwSSRDataMissing } from '../../common/render-context';
import { runWithOwner, type Owner } from '../reactive/owner';
import { untrack } from '../reactive/graph';

type ThenMethod<T> = (
  onfulfilled: (value: T | PromiseLike<T>) => void,
  onrejected: (reason: unknown) => void
) => unknown;

/** Assimilate a captured then method once, using the Promise job queue. */
function assimilate<T>(
  value: unknown,
  then: ThenMethod<T>,
  active: (() => boolean) | undefined,
  fulfilled: (value: T) => void,
  rejected: (error: unknown) => void
): void {
  let nativePromiseConstructor = false;
  if (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    Object.getPrototypeOf(value) === Promise.prototype
  ) {
    // PromiseResolve checks constructor before its identity fast path. Keep
    // that observable getter behavior, but always subscribe through the then
    // method captured above so an accessor is not read again below.
    nativePromiseConstructor =
      (value as Promise<T> & { constructor: unknown }).constructor === Promise;
  }
  // Inspecting the promise constructor can run user code through an accessor.
  // It may refresh this resource, making the captured then method stale.
  if (active && !active()) return;
  let nativeCalled = false;
  const deliver = (next: T) => {
    if (nativeCalled) return;
    nativeCalled = true;
    if (active && !active()) return;
    fulfilled(next);
  };
  const failDelivery = (error: unknown) => {
    if (nativeCalled) return;
    nativeCalled = true;
    if (active && !active()) return;
    rejected(error);
  };
  if (nativePromiseConstructor) {
    try {
      Reflect.apply(then, value, [(next) => deliver(next as T), failDelivery]);
    } catch (error) {
      failDelivery(error);
    }
    return;
  }
  const adopted = new Promise<T>((resolve, reject) => {
    let settled = false;
    const resolving = new Set<object>();
    const finish = (next: T) => {
      if (settled) return;
      settled = true;
      resolve(next);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const ignoreStale = () => finish(undefined as T);
    const resolveValue = (next: unknown): void => {
      if (settled) return;
      if (active && !active()) {
        ignoreStale();
        return;
      }
      if (
        next !== null &&
        (typeof next === 'object' || typeof next === 'function')
      ) {
        if (next === value) {
          fail(new TypeError('Thenable resolution cycle'));
          return;
        }
        let nextThen: ThenMethod<unknown> | null;
        try {
          nextThen = getThen<unknown>(next);
        } catch (error) {
          fail(error);
          return;
        }
        if (active && !active()) {
          ignoreStale();
          return;
        }
        if (nextThen) {
          if (resolving.has(next)) {
            fail(new TypeError('Thenable resolution cycle'));
            return;
          }
          resolving.add(next);
          let called = false;
          queueMicrotask(() => {
            if (settled || called) return;
            if (active && !active()) {
              ignoreStale();
              return;
            }
            const resolveOnce = (resolved: unknown) => {
              if (called) return;
              called = true;
              resolving.delete(next);
              resolveValue(resolved);
            };
            const rejectOnce = (error: unknown) => {
              if (called) return;
              called = true;
              resolving.delete(next);
              fail(error);
            };
            try {
              Reflect.apply(nextThen!, next, [resolveOnce, rejectOnce]);
            } catch (error) {
              rejectOnce(error);
            }
          });
          return;
        }
      }
      finish(next as T);
    };
    let called = false;
    const resolveOnce = (next: T | PromiseLike<T>) => {
      if (called) return;
      called = true;
      resolving.add(value as object);
      resolveValue(next);
    };
    const rejectOnce = (error: unknown) => {
      if (called) return;
      called = true;
      fail(error);
    };
    const invoke = () => {
      if (settled || called) return;
      if (active && !active()) {
        ignoreStale();
        return;
      }
      try {
        Reflect.apply(then, value, [resolveOnce, rejectOnce]);
      } catch (error) {
        rejectOnce(error);
      }
    };
    queueMicrotask(invoke);
  });
  void adopted.then(fulfilled, rejected);
}

function getThen<T>(value: unknown): ThenMethod<T> | null {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return null;
  }
  const then = (value as { then?: unknown }).then;
  return typeof then === 'function' ? (then as ThenMethod<T>) : null;
}

import {
  brandSnapshotSource,
  makeReactiveFields,
  type SnapshotSourceBrand,
} from './snapshot';

/**
 * Pure, component-agnostic ResourceCell state machine.
 * - Holds value/pending/error/generation/controller
 * - Exposes a stable `snapshot` object: { value, pending, error, refresh }
 * - Runs the loader's synchronous step under the owner that created it, so
 *   it can read scopes; continuations after await do not.
 */
export class ResourceCell<U> {
  value: U | null = null;
  pending = true;
  error: Error | null = null;
  generation = 0;
  controller: AbortController | null = null;
  deps: readonly unknown[] | null = null;
  owner: Owner | null = null;

  // Optional debug label set by caller (component name) to improve logs
  ownerName?: string;

  private subscribers = new Set<() => void>();
  private disposed = false;

  readonly snapshot: {
    value: U | null;
    pending: boolean;
    error: Error | null;
    refresh: () => void;
  } & SnapshotSourceBrand;

  private fn: (opts: { signal: AbortSignal }) => PromiseLike<U> | U;

  constructor(
    fn: (opts: { signal: AbortSignal }) => PromiseLike<U> | U,
    deps: readonly unknown[] | null,
    owner: Owner | null
  ) {
    this.fn = fn;
    this.deps = deps ? deps.slice() : null;
    this.owner = owner;
    this.snapshot = brandSnapshotSource(
      makeReactiveFields(
        {
          value: null as U | null,
          pending: true,
          error: null as Error | null,
          refresh: () => this.refresh(),
        },
        ['value', 'pending', 'error']
      )
    );
  }

  setLoader(fn: (opts: { signal: AbortSignal }) => PromiseLike<U> | U): void {
    this.fn = fn;
  }

  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private notifySubscribers() {
    this.snapshot.value = this.value;
    this.snapshot.pending = this.pending;
    this.snapshot.error = this.error;
    for (const cb of this.subscribers) {
      try {
        cb();
      } catch (error) {
        this.reportError(error, 'Resource subscriber error');
      }
    }
  }

  private reportError(error: unknown, label = 'Async resource error') {
    try {
      logger.error(
        `[Askr] ${label}${this.ownerName ? ` in ${this.ownerName}` : ''}:`,
        error
      );
    } catch {
      /* Logging cannot interrupt resource execution or publication. */
    }
  }

  start(ssr = false, notify = true) {
    if (this.disposed) {
      return;
    }

    const generation = this.generation;

    const previous = this.controller;
    const controller = new AbortController();
    this.controller = controller;
    const current = () =>
      this.generation === generation &&
      this.controller === controller &&
      !controller.signal.aborted;
    previous?.abort();
    if (!current()) return;
    this.pending = true;
    this.error = null;
    if (notify) this.notifySubscribers();
    if (!current()) return;

    const fail = (reason: unknown, asynchronous = false) => {
      if (!current()) return;
      let error: Error;
      try {
        if (
          asynchronous &&
          ((reason instanceof Error && reason.name === 'AbortError') ||
            (typeof DOMException !== 'undefined' &&
              reason instanceof DOMException &&
              reason.name === 'AbortError'))
        )
          return;
        error = reason instanceof Error ? reason : new Error(String(reason));
      } catch {
        error = new Error('Resource error normalization failed');
      }
      if (!current()) return;
      this.pending = false;
      this.error = error;
      // The failure is surfaced through `snapshot.error`; the console copy
      // is a development aid and is never written in production.
      if (asynchronous && !isProductionEnvironment()) this.reportError(reason);
      if (current() && (notify || asynchronous)) this.notifySubscribers();
    };

    let result: PromiseLike<U> | U;
    let then: ThenMethod<U> | null;
    try {
      // Execute only the synchronous step inside the frozen resource frame.
      result = untrack(() =>
        runWithOwner(this.owner, () => this.fn({ signal: controller.signal }))
      );
      // Capture a potentially user-defined accessor once. Promise.resolve(result)
      // would read it again and could assimilate a generation canceled by that
      // second read.
      then = getThen<U>(result);
    } catch (err) {
      fail(err);
      return;
    }

    // Reading a user-defined `then` accessor can refresh or dispose this
    // resource before the captured method is assimilated.
    if (!current()) return;

    if (!then) {
      if (!current()) return;
      this.value = result as U;
      this.pending = false;
      this.error = null;
      if (notify) this.notifySubscribers();
      return;
    }

    if (ssr) {
      // Observe rejected work before abort listeners can reject it. SSR stays
      // synchronous, but the loader's asynchronous failure must remain owned.
      assimilate<U>(
        result,
        then,
        undefined,
        () => {},
        () => {}
      );
      controller.abort();
      throwSSRDataMissing();
    }

    try {
      assimilate<U>(
        result,
        then,
        current,
        (val) => {
          if (!current()) return;
          this.value = val;
          this.pending = false;
          this.error = null;
          this.notifySubscribers();
        },
        (err) => fail(err, true)
      );
    } catch (err) {
      fail(err);
    }
  }

  refresh() {
    if (this.disposed) {
      return;
    }

    this.generation++;
    this.start();
  }

  abort() {
    this.controller?.abort();
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.controller?.abort();
    this.subscribers.clear();
  }
}
