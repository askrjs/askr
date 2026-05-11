import { globalScheduler } from '../runtime/scheduler';
import {
  claimHookIndex,
  getCurrentComponentInstance,
  type ComponentInstance,
} from '../runtime/component';
import {
  markReadableDerivedSubscribersDirty,
  markReactivePropsDirtySource,
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from '../runtime/readable';
import { getRenderContext } from '../ssr/context';

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

type QuerySlot = {
  key: string;
  cell: QueryCell<unknown>;
};

const RECONCILE_MAX_ATTEMPTS = 3;
const RECONCILE_RETRY_DELAY_MS = 25;
const globalQueryCache = new Map<string, QueryCell<unknown>>();
const querySlotsByInstance = new WeakMap<ComponentInstance, Map<number, QuerySlot>>();
const mutationSlotsByInstance = new WeakMap<
  ComponentInstance,
  Map<number, MutationCell<unknown, unknown>>
>();
const queryCleanupRegistered = new WeakSet<ComponentInstance>();
const mutationCleanupRegistered = new WeakSet<ComponentInstance>();

function createReadableSource(): ReadableSource<unknown> {
  return (() => undefined) as ReadableSource<unknown>;
}

function getQueryCache(): Map<string, QueryCell<unknown>> {
  return (getRenderContext()?.queryCache as Map<
    string,
    QueryCell<unknown>
  > | null) ?? globalQueryCache;
}

function getQuerySlotStore(instance: ComponentInstance): Map<number, QuerySlot> {
  let store = querySlotsByInstance.get(instance);
  if (!store) {
    store = new Map();
    querySlotsByInstance.set(instance, store);
  }
  return store;
}

function getMutationSlotStore(
  instance: ComponentInstance
): Map<number, MutationCell<unknown, unknown>> {
  let store = mutationSlotsByInstance.get(instance);
  if (!store) {
    store = new Map();
    mutationSlotsByInstance.set(instance, store);
  }
  return store;
}

function ensureQueryCleanup(instance: ComponentInstance): void {
  if (queryCleanupRegistered.has(instance)) {
    return;
  }

  queryCleanupRegistered.add(instance);
  instance.cleanupFns.push(() => {
    const slots = querySlotsByInstance.get(instance);
    if (!slots) {
      queryCleanupRegistered.delete(instance);
      return;
    }

    for (const [hookIndex, slot] of slots) {
      slot.cell.detach(instance, hookIndex);
    }

    slots.clear();
    querySlotsByInstance.delete(instance);
    queryCleanupRegistered.delete(instance);
  });
}

function ensureMutationCleanup(instance: ComponentInstance): void {
  if (mutationCleanupRegistered.has(instance)) {
    return;
  }

  mutationCleanupRegistered.add(instance);
  instance.cleanupFns.push(() => {
    const slots = mutationSlotsByInstance.get(instance);
    if (!slots) {
      mutationCleanupRegistered.delete(instance);
      return;
    }

    for (const cell of slots.values()) {
      cell.abort();
    }

    slots.clear();
    mutationSlotsByInstance.delete(instance);
    mutationCleanupRegistered.delete(instance);
  });
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

function invalidateQueries(prefix: string, markPendingWrite: boolean): void {
  const cache = getQueryCache();

  for (const [key, query] of cache) {
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
  private readonly key: string;
  private readonly cache: Map<string, QueryCell<unknown>>;
  private options: QueryOptions<T>;
  private controller: AbortController | null = null;
  private generation = 0;
  private startQueued = false;
  private pendingRefresh: Promise<void> | null = null;
  private pendingRefreshResolve: (() => void) | null = null;
  private reconcileAttemptCount = 0;
  private destroyed = false;
  private ownerCount = 0;
  private readonly owners = new Map<ComponentInstance, Set<number>>();

  private state: QueryState<T> = {
    data: null,
    error: null,
    loading: true,
    refreshing: false,
    stale: false,
    consistency: 'fresh',
  };

  constructor(
    options: QueryOptions<T>,
    key: string,
    cache: Map<string, QueryCell<unknown>>
  ) {
    this.options = options;
    this.key = key;
    this.cache = cache;
  }

  attach(instance: ComponentInstance, hookIndex: number): void {
    let hooks = this.owners.get(instance);
    if (!hooks) {
      hooks = new Set();
      this.owners.set(instance, hooks);
    }

    if (hooks.has(hookIndex)) {
      return;
    }

    hooks.add(hookIndex);
    this.ownerCount += 1;
  }

  detach(instance: ComponentInstance, hookIndex: number): void {
    const hooks = this.owners.get(instance);
    if (!hooks || !hooks.delete(hookIndex)) {
      return;
    }

    this.ownerCount -= 1;
    if (hooks.size === 0) {
      this.owners.delete(instance);
    }

    if (this.ownerCount <= 0) {
      this.destroy();
    }
  }

  private destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.controller?.abort();
    this.controller = null;
    this.startQueued = false;
    this.reconcileAttemptCount = 0;
    this.ownerCount = 0;
    this.owners.clear();
    this.cache.delete(this.key);
    this.finishPendingRefresh();
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
    if (
      this.destroyed ||
      this.state.data !== null ||
      this.pendingRefresh ||
      this.startQueued
    ) {
      return;
    }

    this.queueStart('initial');
  }

  refresh(): Promise<void> {
    if (this.destroyed) {
      return Promise.resolve();
    }

    if (this.pendingRefresh) {
      return this.pendingRefresh;
    }

    this.queueStart('manual');
    return this.pendingRefresh ?? Promise.resolve();
  }

  markPendingWrite(): void {
    if (this.destroyed) {
      return;
    }

    this.setState({
      refreshing: true,
      stale: true,
      consistency: 'pending-write',
    });
  }

  private queueStart(
    reason: 'initial' | 'manual' | 'invalidate' | 'pending-write'
  ): void {
    if (this.destroyed) {
      return;
    }

    this.startQueued = true;
    this.pendingRefresh = new Promise<void>((resolve) => {
      this.pendingRefreshResolve = resolve;
      globalScheduler.enqueue(() => {
        this.startQueued = false;
        if (this.destroyed) {
          this.finishPendingRefresh();
          return;
        }
        void this.start(reason).finally(() => {
          this.finishPendingRefresh();
        });
      });
    });
  }

  private finishPendingRefresh(): void {
    const resolve = this.pendingRefreshResolve;
    this.pendingRefresh = null;
    this.pendingRefreshResolve = null;
    resolve?.();
  }

  private setState(next: Partial<QueryState<T>>): void {
    if (this.destroyed) {
      return;
    }

    this.state = {
      ...this.state,
      ...next,
    };
    notifySource(this.source);
  }

  private async start(
    reason: 'initial' | 'manual' | 'invalidate' | 'pending-write'
  ): Promise<void> {
    if (this.destroyed) {
      return;
    }

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
      if (this.destroyed || this.generation !== generation || this.controller !== controller) {
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

    if (this.destroyed || this.generation !== generation || this.controller !== controller) {
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

    if (!shouldRetry || this.destroyed) {
      return;
    }

    this.reconcileAttemptCount += 1;
    if (this.reconcileAttemptCount > RECONCILE_MAX_ATTEMPTS) {
      this.setState({ consistency: 'stale', refreshing: false });
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, RECONCILE_RETRY_DELAY_MS));
    if (this.destroyed || this.state.consistency === 'fresh') {
      return;
    }

    await this.refresh();
  }
}

class MutationCell<TInput, TResult> implements Mutation<TInput, TResult> {
  private readonly source = createReadableSource();
  private action: MutationOptions<TInput, TResult>['action'];
  private affects?: MutationOptions<TInput, TResult>['affects'];
  private afterSuccess?: MutationOptions<TInput, TResult>['afterSuccess'];
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

  setOptions(options: MutationOptions<TInput, TResult>): void {
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
  const instance = getCurrentComponentInstance();
  const cache = getQueryCache();
  if (!instance) {
    let cell = cache.get(options.key) as QueryCell<T> | undefined;
    if (!cell) {
      cell = new QueryCell(options, options.key, cache);
      cache.set(options.key, cell as QueryCell<unknown>);
      cell.ensureStarted();
    }
    return cell;
  }

  const hookIndex = claimHookIndex(instance, 'query');
  ensureQueryCleanup(instance);

  const slotStore = getQuerySlotStore(instance);
  const existingSlot = slotStore.get(hookIndex);
  if (existingSlot && existingSlot.key === options.key) {
    return existingSlot.cell as QueryCell<T>;
  }

  if (existingSlot) {
    existingSlot.cell.detach(instance, hookIndex);
  }

  let cell = cache.get(options.key) as QueryCell<T> | undefined;
  if (!cell) {
    cell = new QueryCell(options, options.key, cache);
    cache.set(options.key, cell as QueryCell<unknown>);
    cell.ensureStarted();
  }

  slotStore.set(hookIndex, {
    key: options.key,
    cell: cell as QueryCell<unknown>,
  });
  cell.attach(instance, hookIndex);
  return cell;
}

export function invalidate(prefix: string): void {
  invalidateQueries(prefix, false);
}

export function createMutation<TInput, TResult>(
  options: MutationOptions<TInput, TResult>
): Mutation<TInput, TResult> {
  const instance = getCurrentComponentInstance();

  if (!instance) {
    return new MutationCell(options);
  }

  const hookIndex = claimHookIndex(instance, 'mutation');
  ensureMutationCleanup(instance);

  const slotStore = getMutationSlotStore(instance);
  const existing = slotStore.get(hookIndex) as
    | MutationCell<TInput, TResult>
    | undefined;
  if (existing) {
    existing.setOptions(options);
    return existing;
  }

  const created = new MutationCell(options);
  slotStore.set(hookIndex, created as MutationCell<unknown, unknown>);
  return created;
}
