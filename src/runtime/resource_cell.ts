import { withAsyncResourceContext, type ContextFrame } from './context';
import { logger } from '../dev/logger';
import { SSRDataMissingError } from '../ssr/context';

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
  deps: unknown[] | null = null;
  resourceFrame: ContextFrame | null = null;

  private subscribers = new Set<() => void>();

  readonly snapshot: {
    value: U | null;
    pending: boolean;
    error: Error | null;
    refresh: () => void;
  };

  private readonly fn: (opts: { signal: AbortSignal }) => Promise<U> | U;

  constructor(
    fn: (opts: { signal: AbortSignal }) => Promise<U> | U,
    deps: unknown[] | null,
    resourceFrame: ContextFrame | null
  ) {
    this.fn = fn;
    this.deps = deps ? deps.slice() : null;
    this.resourceFrame = resourceFrame;
    this.snapshot = {
      value: null,
      pending: true,
      error: null,
      refresh: () => this.refresh(),
    };
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
    const generation = this.generation;

    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.pending = true;
    this.error = null;
    if (notify) this.notifySubscribers();

    let result: Promise<U> | U;
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

    if (!(result instanceof Promise)) {
      this.value = result as U;
      this.pending = false;
      this.error = null;
      if (notify) this.notifySubscribers();
      return;
    }

    if (ssr) {
      // During SSR async results are disallowed
      throw new SSRDataMissingError();
    }

    (result as Promise<U>)
      .then((val) => {
        if (this.generation !== generation) return;
        if (this.controller !== controller) return;
        this.value = val;
        this.pending = false;
        this.error = null;
        this.notifySubscribers();
      })
      .catch((err) => {
        if (this.generation !== generation) return;
        this.pending = false;
        this.error = err as Error;
        try {
          logger.error('[Askr] Async resource error:', err);
        } catch {
          /* ignore logging errors */
        }
        this.notifySubscribers();
      });
  }

  refresh() {
    this.generation++;
    this.controller?.abort();
    this.start();
  }

  abort() {
    this.controller?.abort();
  }
}
