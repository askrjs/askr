import { globalScheduler } from '../runtime/scheduler';
import {
  markReadableDerivedSubscribersDirty,
  markReactivePropsDirtySource,
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from '../runtime/readable';

export type QueryConsistency =
  | 'fresh'
  | 'stale'
  | 'refreshing'
  | 'pending-write';

export type Query<T> = {
  data: T | null;
  error: unknown | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  consistency: QueryConsistency;

  refresh(): Promise<void>;
};

export type Mutation<TInput, TResult> = {
  status: 'idle' | 'pending' | 'success' | 'error';
  pending: boolean;
  error: unknown | null;
  result: TResult | null;

  execute(input: TInput): Promise<TResult>;
  abort(): void;
  reset(): void;
};

type QueryOptions<T> = {
  key: string;
  fetch: (ctx: { signal: AbortSignal }) => Promise<T>;
  isConsistent?: (data: T) => boolean;
  reconcile?: (data: T, ctx: { key: string }) => Promise<boolean> | boolean;
};

type MutationOptions<TInput, TResult> = {
  action: (input: TInput, ctx: { signal: AbortSignal }) => Promise<TResult>;
  affects?: (input: TInput, result: TResult) => string[];
  afterSuccess?: 'invalidate';
};

type QueryState<T> = {
  data: T | null;
  error: unknown | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  consistency: QueryConsistency;
};

type MutationState<TResult> = {
  status: 'idle' | 'pending' | 'success' | 'error';
  error: unknown | null;
  result: TResult | null;
};

function createReadableSource(): ReadableSource<unknown> {
  return (() => undefined) as ReadableSource<unknown>;
}

function notifySource(source: ReadableSource<unknown>): void {
  markReadableDerivedSubscribersDirty(source);
  markReactivePropsDirtySource(source);
  notifyReadableReaders(source);
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError')
  );
}

const queryCache = new Map<string, QueryCell<unknown>>();

function invalidateQueries(prefix: string, markPendingWrite: boolean): void {
  for (const [key, query] of queryCache) {
    if (!key.startsWith(prefix)) {
      continue;
    }

    if (markPendingWrite) {
      query.markPendingWrite();
    }

    void query.refresh();
  }
}

class QueryCell<T> implements Query<T> {
  private readonly source = createReadableSource();
  private options: QueryOptions<T>;
  private controller: AbortController | null = null;
  private generation = 0;
  private startQueued = false;
  private pendingRefresh: Promise<void> | null = null;
  private reconcileAttemptCount = 0;

  private state: QueryState<T> = {
    data: null,
    error: null,
    loading: true,
    refreshing: false,
    stale: false,
    consistency: 'fresh',
  };

  constructor(options: QueryOptions<T>) {
    this.options = options;
  }

  setOptions(options: QueryOptions<T>): void {
    this.options = options;
  }

  get data(): T | null {
    recordReadableRead(this.source);
    return this.state.data;
  }

  get error(): unknown | null {
    recordReadableRead(this.source);
    return this.state.error;
  }

  get loading(): boolean {
    recordReadableRead(this.source);
    return this.state.loading;
  }

  get refreshing(): boolean {
    recordReadableRead(this.source);
    return this.state.refreshing;
  }

  get stale(): boolean {
    recordReadableRead(this.source);
    return this.state.stale;
  }

  get consistency(): QueryConsistency {
    recordReadableRead(this.source);
    return this.state.consistency;
  }

  ensureStarted(): void {
    if (this.state.data !== null || this.pendingRefresh || this.startQueued) {
      return;
    }

    this.queueStart('initial');
  }

  refresh(): Promise<void> {
    if (this.pendingRefresh) {
      return this.pendingRefresh;
    }

    this.queueStart('manual');
    return this.pendingRefresh ?? Promise.resolve();
  }

  markPendingWrite(): void {
    this.setState({
      refreshing: true,
      stale: true,
      consistency: 'pending-write',
    });
  }

  private queueStart(
    reason: 'initial' | 'manual' | 'invalidate' | 'pending-write'
  ): void {
    this.startQueued = true;
    this.pendingRefresh = new Promise<void>((resolve) => {
      globalScheduler.enqueue(() => {
        this.startQueued = false;
        void this.start(reason).finally(() => {
          this.pendingRefresh = null;
          resolve();
        });
      });
    });
  }

  private setState(next: Partial<QueryState<T>>): void {
    this.state = {
      ...this.state,
      ...next,
    };
    notifySource(this.source);
  }

  private async start(
    reason: 'initial' | 'manual' | 'invalidate' | 'pending-write'
  ): Promise<void> {
    this.generation += 1;
    const generation = this.generation;

    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    const hasData = this.state.data !== null;
    this.setState({
      loading: !hasData,
      refreshing: hasData,
      stale: hasData,
      consistency:
        reason === 'pending-write'
          ? 'pending-write'
          : hasData
            ? 'refreshing'
            : 'fresh',
      error: null,
    });

    let nextData: T;
    try {
      nextData = await this.options.fetch({ signal: controller.signal });
    } catch (error) {
      if (this.generation !== generation || this.controller !== controller) {
        return;
      }

      if (isAbortError(error, controller.signal)) {
        this.setState({ loading: false, refreshing: false });
        return;
      }

      this.setState({
        loading: false,
        refreshing: false,
        stale: true,
        consistency: 'stale',
        error,
      });
      return;
    }

    if (this.generation !== generation || this.controller !== controller) {
      return;
    }

    const isConsistent = this.options.isConsistent?.(nextData) ?? true;
    if (!isConsistent) {
      this.setState({
        data: nextData,
        loading: false,
        refreshing: false,
        stale: true,
        consistency: 'stale',
      });
      await this.reconcile(nextData);
      return;
    }

    this.reconcileAttemptCount = 0;
    this.setState({
      data: nextData,
      loading: false,
      refreshing: false,
      stale: false,
      consistency: 'fresh',
      error: null,
    });
  }

  private async reconcile(data: T): Promise<void> {
    const shouldRetry =
      this.options.reconcile?.(data, { key: this.options.key }) ?? false;

    if (!shouldRetry) {
      return;
    }

    this.reconcileAttemptCount += 1;
    if (this.reconcileAttemptCount > 3) {
      this.setState({ consistency: 'stale', refreshing: false });
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    if (this.state.consistency === 'fresh') {
      return;
    }

    await this.refresh();
  }
}

class MutationCell<TInput, TResult> implements Mutation<TInput, TResult> {
  private readonly source = createReadableSource();
  private readonly action: MutationOptions<TInput, TResult>['action'];
  private readonly affects?: MutationOptions<TInput, TResult>['affects'];
  private readonly afterSuccess?: MutationOptions<
    TInput,
    TResult
  >['afterSuccess'];
  private controller: AbortController | null = null;
  private generation = 0;

  private state: MutationState<TResult> = {
    status: 'idle',
    error: null,
    result: null,
  };

  constructor(options: MutationOptions<TInput, TResult>) {
    this.action = options.action;
    this.affects = options.affects;
    this.afterSuccess = options.afterSuccess;
  }

  get status(): 'idle' | 'pending' | 'success' | 'error' {
    recordReadableRead(this.source);
    return this.state.status;
  }

  get pending(): boolean {
    recordReadableRead(this.source);
    return this.state.status === 'pending';
  }

  get error(): unknown | null {
    recordReadableRead(this.source);
    return this.state.error;
  }

  get result(): TResult | null {
    recordReadableRead(this.source);
    return this.state.result;
  }

  private setState(next: Partial<MutationState<TResult>>): void {
    this.state = {
      ...this.state,
      ...next,
    };
    notifySource(this.source);
  }

  async execute(input: TInput): Promise<TResult> {
    this.generation += 1;
    const generation = this.generation;

    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    this.setState({ status: 'pending', error: null, result: null });

    let result: TResult;
    try {
      result = await this.action(input, { signal: controller.signal });
    } catch (error) {
      if (this.generation !== generation || this.controller !== controller) {
        throw error;
      }

      if (isAbortError(error, controller.signal)) {
        this.setState({ status: 'idle', error: null });
        throw error;
      }

      this.setState({ status: 'error', error });
      throw error;
    }

    if (this.generation !== generation || this.controller !== controller) {
      return result;
    }

    this.setState({ status: 'success', error: null, result });

    if (this.afterSuccess === 'invalidate') {
      const prefixes = this.affects?.(input, result) ?? [];
      for (const prefix of new Set(prefixes)) {
        invalidateQueries(prefix, true);
      }
    }

    return result;
  }

  abort(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    this.setState({ status: 'idle', error: null });
  }

  reset(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    this.setState({ status: 'idle', error: null, result: null });
  }
}

export function createQuery<T>(options: QueryOptions<T>): Query<T> {
  const existing = queryCache.get(options.key) as QueryCell<T> | undefined;
  if (existing) {
    existing.setOptions(options);
    return existing;
  }

  const created = new QueryCell(options);
  queryCache.set(options.key, created as QueryCell<unknown>);
  created.ensureStarted();
  return created;
}

export function invalidate(prefix: string): void {
  invalidateQueries(prefix, false);
}

export function createMutation<TInput, TResult>(
  options: MutationOptions<TInput, TResult>
): Mutation<TInput, TResult> {
  return new MutationCell(options);
}
