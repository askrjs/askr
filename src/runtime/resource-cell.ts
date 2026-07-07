import { withAsyncResourceContext, type ContextFrame } from './context';
import { logger } from '../common/logger';
import {
  brandSnapshotSource,
  type SnapshotSourceBrand,
} from './snapshot-source';
import { isPromiseLike } from '../common/promise';
import { throwSSRDataMissing } from '../common/render-context';

/**
 * Pure, component-agnostic ResourceCell state machine.
 * - Holds value/pending/error/generation/controller
 * - Exposes a stable `snapshot` object: { value, pending, error, refresh }
 * - Uses `withAsyncResourceContext` to bind the synchronous execution step
 *   to a captured frame. Continuations after await do not see the frame.
 */
export class ResourceCell<U> {
  value: U | null = null;
  pending = true;
  error: Error | null = null;
  generation = 0;
  controller: AbortController | null = null;
  deps: readonly unknown[] | null = null;
  resourceFrame: ContextFrame | null = null;

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
    resourceFrame: ContextFrame | null
  ) {
    this.fn = fn;
    this.deps = deps ? deps.slice() : null;
    this.resourceFrame = resourceFrame;
    this.snapshot = brandSnapshotSource({
      value: null,
      pending: true,
      error: null,
      refresh: () => this.refresh(),
    });
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
    for (const cb of this.subscribers) cb();
  }

  start(ssr = false, notify = true) {
    if (this.disposed) {
      return;
    }

    const generation = this.generation;

    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.pending = true;
    this.error = null;
    if (notify) this.notifySubscribers();

    let result: PromiseLike<U> | U;
    try {
      // Execute only the synchronous step inside the frozen resource frame.
      result = withAsyncResourceContext(this.resourceFrame, () =>
        this.fn({ signal: controller.signal })
      );
    } catch (err) {
      this.pending = false;
      this.error = err as Error;
      if (notify) this.notifySubscribers();
      return;
    }

    if (!isPromiseLike<U>(result)) {
      this.value = result as U;
      this.pending = false;
      this.error = null;
      if (notify) this.notifySubscribers();
      return;
    }

    if (ssr) {
      // During SSR async results are disallowed
      throwSSRDataMissing();
    }

    Promise.resolve(result)
      .then((val) => {
        if (this.generation !== generation) return;
        if (this.controller !== controller) return;
        // A loader that does not reject on abort (e.g. a plain Promise) would
        // otherwise commit its value after the fetch was cancelled by a deps
        // change, refresh(), or unmount. Mirror the AbortError guard used in
        // the rejection path so an aborted fetch's resolution stays inert.
        if (controller.signal.aborted) return;
        this.value = val;
        this.pending = false;
        this.error = null;
        this.notifySubscribers();
      })
      .catch((err) => {
        if (this.generation !== generation) return;
        if (this.controller !== controller) return;

        const isAbortError =
          controller.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError') ||
          (typeof DOMException !== 'undefined' &&
            err instanceof DOMException &&
            err.name === 'AbortError');

        if (isAbortError) {
          return;
        }

        this.pending = false;
        this.error = err as Error;
        try {
          if (this.ownerName) {
            logger.error(
              `[Askr] Async resource error in ${this.ownerName}:`,
              err
            );
          } else {
            logger.error('[Askr] Async resource error:', err);
          }
        } catch {
          /* ignore logging errors */
        }
        this.notifySubscribers();
      });
  }

  refresh() {
    if (this.disposed) {
      return;
    }

    this.generation++;
    this.controller?.abort();
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
