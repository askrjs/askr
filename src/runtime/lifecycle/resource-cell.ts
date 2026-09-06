import {
  withAsyncResourceContext,
  type ContextFrame,
} from '../context/context';
import { logger } from '../../common/logger';
import {
  brandSnapshotSource,
  type SnapshotSourceBrand,
} from '../reactivity/snapshot-source';
import { isPromiseLike } from '../../common/promise';
import { throwSSRDataMissing } from '../../common/render-context';
import { adjustOwnershipDiagnostic } from '../diagnostics/ownership-diagnostics';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

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
    if (__ASKR_DEVELOPMENT_BUILD__) {
      adjustOwnershipDiagnostic('resources', 1);
    }
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

    let result: PromiseLike<U> | U;
    let asynchronous: boolean;
    try {
      // Execute only the synchronous step inside the frozen resource frame.
      result = withAsyncResourceContext(this.resourceFrame, () =>
        this.fn({ signal: controller.signal })
      );
      asynchronous = isPromiseLike<U>(result);
    } catch (err) {
      if (!current()) return;
      this.pending = false;
      this.error = err instanceof Error ? err : new Error(String(err));
      if (notify) this.notifySubscribers();
      return;
    }

    if (!asynchronous) {
      if (!current()) return;
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

    Promise.resolve(result).then(
      (val) => {
        if (!current()) return;
        this.value = val;
        this.pending = false;
        this.error = null;
        this.notifySubscribers();
      },
      (err) => {
        if (!current()) return;

        const isAbortError =
          (err instanceof Error && err.name === 'AbortError') ||
          (typeof DOMException !== 'undefined' &&
            err instanceof DOMException &&
            err.name === 'AbortError');

        if (isAbortError) {
          return;
        }

        this.pending = false;
        this.error = err instanceof Error ? err : new Error(String(err));
        this.reportError(err);
        this.notifySubscribers();
      }
    );
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
    if (__ASKR_DEVELOPMENT_BUILD__) {
      adjustOwnershipDiagnostic('resources', -1);
    }
    this.controller?.abort();
    this.subscribers.clear();
  }
}
