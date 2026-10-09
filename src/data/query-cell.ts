import {
  loadingQueryState,
  freshQueryState,
  refreshingQueryState,
  staleQueryState,
  errorQueryState,
} from './query-state';
import { getActiveRenderContext } from '../common/render-context';
import {
  claimHookIndex,
  currentAppRuntime as getCurrentAppRenderRuntime,
  currentComponent as getCurrentComponentInstance,
  readSource as recordReadableRead,
} from '../core/api/hooks';
import { schedule, type Job } from '../core/reactive/scheduler';
import {
  ensureQueryCleanup,
  getQuerySlotStore,
  readQueryData,
  resolveDataRuntimeState,
} from './data-runtime';
import { getDefaultDataRuntime } from './data-runtime';
import {
  hasCollectionReaders,
  hasCollectionWork,
} from './collection-invalidation';
import {
  createReadableSource,
  isAbortError,
  isCurrentAsyncOperation,
  normalizeAsyncDataError,
  notifySource,
} from './shared';
import {
  QueryLifetime,
  validateGcTime,
  isServerQueryRender,
  type QueryCellOptions,
} from './query-lifetime';
import type { Query, QueryOptions, QueryState } from './types';

const RECONCILE_MAX_ATTEMPTS = 3;
const RECONCILE_RETRY_DELAY_MS = 25;
const DEFAULT_OWNERLESS_GC_TIME_MS = 5 * 60_000;

type QueryOperation = {
  readonly generation: number;
  readonly controller: AbortController;
};

/** Starts a query fetch in the flush; settles its promise if dropped. */
class QueryStartWork implements Job {
  constructor(
    readonly run: () => void,
    private readonly settle: () => void
  ) {}

  cancel(): void {
    this.settle();
  }
}

export class QueryCell<T> {
  private readonly source = createReadableSource();
  private readonly key: string;
  private readonly lifetime: QueryLifetime<T>;
  private controller: AbortController | null = null;
  private generation = 0;
  private pendingRefresh: Promise<void> | null = null;
  private pendingRefreshKind:
    | 'initial'
    | 'manual'
    | 'invalidation'
    | 'reconcile'
    | null = null;
  private pendingRefreshResolve: (() => void) | null = null;
  private pendingRefreshToken = 0;
  private reconcileAttemptCount = 0;
  private reconcileSequence = 0;

  private state: QueryState<T> = loadingQueryState<T>();
  private freshAt: number | null = null;

  constructor(
    options: QueryCellOptions<T>,
    key: string,
    cache: Map<string, QueryCell<unknown>>
  ) {
    this.key = key;
    this.lifetime = new QueryLifetime(options, key, cache, this, {
      snapshot: () => this.state,
      retireInactiveFetch: () => this.retireInactiveFetch(),
      markRetainedAborted: () =>
        this.setState(staleQueryState(this.state.data, 'aborted')),
      destroyFetch: () => {
        this.controller?.abort();
        this.controller = null;
        this.reconcileAttemptCount = 0;
      },
      finishPendingRefresh: () => this.finishPendingRefresh(),
    });
    if (options.initialData !== undefined) {
      this.state = freshQueryState(options.initialData);
      if (!isServerQueryRender()) this.freshAt = Date.now();
    }
  }

  private get options(): QueryCellOptions<T> {
    return this.lifetime.currentOptions;
  }
  private get destroyed(): boolean {
    return this.lifetime.isDestroyed;
  }
  private get ownerCount(): number {
    return this.lifetime.readerCount;
  }

  attach(owner: object, hookIndex: number): void {
    this.lifetime.attach(owner, hookIndex);
  }
  detach(owner: object, hookIndex: number): void {
    this.lifetime.detach(owner, hookIndex);
  }
  define(options: QueryCellOptions<T>, owner: object, hookIndex: number): void {
    this.lifetime.define(options, owner, hookIndex);
  }
  warnOnConflictingDefinition(options: QueryCellOptions<T>): void {
    this.lifetime.warnOnConflictingDefinition(options);
  }
  retireInactiveReaderCacheEntry(): boolean {
    return this.lifetime.retireInactiveReaderCacheEntry();
  }
  scheduleUnownedCacheEviction(gcTime: number): void {
    this.lifetime.scheduleUnownedCacheEviction(gcTime);
  }
  private destroy(): void {
    this.lifetime.destroy();
  }

  /** Revoke queued/running work before the lifetime retains its cached snapshot. */
  private retireInactiveFetch(): AbortController | null {
    this.generation += 1;
    const controller = this.controller;
    this.controller = null;
    this.finishPendingRefresh();
    this.pendingRefreshToken += 1;
    return controller;
  }

  get data(): T | null {
    recordReadableRead(this.source);
    return this.state.data;
  }

  get error(): {} | null {
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

  get consistency(): QueryState<T>['consistency'] {
    recordReadableRead(this.source);
    return this.state.consistency;
  }

  get staleReason(): QueryState<T>['staleReason'] {
    recordReadableRead(this.source);
    return this.state.staleReason;
  }

  /** @internal Whether a collection should schedule this cell's first load. */
  needsInitialStart(): boolean {
    return (
      !this.destroyed &&
      this.state.data === null &&
      this.state.error === null &&
      !this.pendingRefresh
    );
  }

  ensureStarted(): void {
    if (
      this.destroyed ||
      this.state.data !== null ||
      this.pendingRefresh ||
      this.options.skipInitialFetch
    ) {
      return;
    }

    this.queueStart(undefined, 'initial');
  }

  refresh(): Promise<void> {
    if (this.destroyed) {
      return Promise.resolve();
    }
    if (this.lifetime.inactive) {
      this.destroy();
      return Promise.resolve();
    }

    if (this.pendingRefresh) {
      if (this.pendingRefreshKind === 'invalidation') {
        this.generation += 1;
        this.controller?.abort();
        this.queueStart(undefined, 'manual', true);
        return this.pendingRefresh ?? Promise.resolve();
      } else {
        return this.pendingRefresh;
      }
    }

    this.queueStart(undefined, 'manual');
    return this.pendingRefresh ?? Promise.resolve();
  }

  /** @internal Activity never wakes ownerless/skipped cells or supersedes work. */
  needsActivityRefresh(staleTimeMs: number | 'always', now: number): boolean {
    if (
      this.destroyed ||
      this.ownerCount === 0 ||
      (this.options.skipInitialFetch && !hasCollectionReaders(this)) ||
      this.pendingRefresh ||
      this.state.refreshing ||
      hasCollectionWork(this)
    ) {
      return false;
    }
    return (
      staleTimeMs === 'always' ||
      this.state.stale ||
      this.freshAt === null ||
      now - this.freshAt >= staleTimeMs
    );
  }

  /** @internal Show an invalidation while a collection waits for a fetch slot. */
  markQueuedInvalidation(): void {
    if (this.destroyed) return;
    this.generation += 1;
    this.controller?.abort();
    this.setState(
      this.state.data === null
        ? loadingQueryState<T>()
        : refreshingQueryState(
            this.state.data,
            this.state.consistency === 'pending-write'
              ? 'pending-write'
              : 'refreshing'
          )
    );
  }

  invalidate(): Promise<void> {
    if (this.destroyed) {
      return Promise.resolve();
    }
    if (this.lifetime.inactive) {
      this.destroy();
      return Promise.resolve();
    }

    if (this.pendingRefresh) {
      // Invalidation supersedes stale work. Manual refreshes, by contrast,
      // are equivalent requests and share the in-flight generation.
      this.generation += 1;
      this.controller?.abort();
      this.queueStart(undefined, 'invalidation', true);
      return this.pendingRefresh ?? Promise.resolve();
    }

    this.queueStart(undefined, 'invalidation');
    return this.pendingRefresh ?? Promise.resolve();
  }

  markPendingWrite(): void {
    if (this.destroyed) {
      return;
    }

    if (this.state.data === null) {
      return;
    }

    this.setState(refreshingQueryState(this.state.data, 'pending-write'));
  }

  private queueStart(
    reconcileSequence?: number,
    kind: 'initial' | 'manual' | 'invalidation' | 'reconcile' = 'manual',
    continuePending = false
  ): void {
    if (this.destroyed) {
      return;
    }

    const sequence =
      reconcileSequence ??
      (() => {
        this.reconcileAttemptCount = 0;
        return ++this.reconcileSequence;
      })();
    this.pendingRefreshKind = kind;
    const token = ++this.pendingRefreshToken;
    if (!continuePending || !this.pendingRefresh) {
      this.pendingRefresh = new Promise<void>((resolve) => {
        this.pendingRefreshResolve = resolve;
      });
    }
    schedule(
      new QueryStartWork(
        () => {
          if (token !== this.pendingRefreshToken) {
            return;
          }
          if (this.destroyed) {
            this.finishPendingRefresh(token);
            return;
          }
          void this.start(sequence).finally(() => {
            this.finishPendingRefresh(token);
          });
        },
        () => {
          if (token !== this.pendingRefreshToken) return;
          // The replacement may have already aborted a running fetch. Retire
          // its authority even when that fetch ignores cancellation.
          this.generation += 1;
          this.finishPendingRefresh(token);
        }
      ),
      // After queued renders, so state they are about to show (such as
      // pending-write) commits before the fetch moves the query on.
      'effect'
    );
  }

  private finishPendingRefresh(token = this.pendingRefreshToken): void {
    if (token !== this.pendingRefreshToken) {
      return;
    }
    const resolve = this.pendingRefreshResolve;
    this.pendingRefresh = null;
    this.pendingRefreshKind = null;
    this.pendingRefreshResolve = null;
    resolve?.();
  }

  /** The sole authority for an async operation to publish or continue work. */
  private isCurrent(operation: QueryOperation): boolean {
    return (
      !this.destroyed &&
      isCurrentAsyncOperation(
        this.generation,
        operation.generation,
        this.controller,
        operation.controller
      )
    );
  }

  private setState(next: QueryState<T>, operation?: QueryOperation): void {
    if (operation ? !this.isCurrent(operation) : this.destroyed) {
      return;
    }

    this.state = next;
    notifySource(this.source);
  }

  private async start(reconcileSequence: number): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.generation += 1;
    const generation = this.generation;

    const previousController = this.controller;
    const controller = new AbortController();
    this.controller = controller;
    const operation = { generation, controller };
    previousController?.abort();
    if (!this.isCurrent(operation)) return;

    const hasData = this.state.data !== null;
    this.setState(
      hasData ? refreshingQueryState(this.state.data!) : loadingQueryState<T>(),
      operation
    );
    if (!this.isCurrent(operation)) return;

    // An in-flight fetch keeps the definition it started with, even if the
    // owning reader re-renders with new callbacks before it settles.
    const { fetch, isConsistent: checkConsistent, reconcile } = this.options;
    let nextData: T;
    try {
      nextData = await fetch({ signal: controller.signal });
    } catch (error) {
      if (!this.isCurrent(operation)) {
        return;
      }

      if (isAbortError(error, controller.signal)) {
        this.setState(
          hasData
            ? staleQueryState(this.state.data, 'aborted')
            : loadingQueryState<T>(),
          operation
        );
        return;
      }

      this.setState(
        errorQueryState(
          this.state.data,
          normalizeAsyncDataError(error, 'Unknown query error')
        ),
        operation
      );
      return;
    }

    if (!this.isCurrent(operation)) {
      return;
    }

    let isConsistent: boolean;
    try {
      isConsistent = checkConsistent?.(nextData) ?? true;
    } catch (error) {
      this.setState(
        errorQueryState(
          this.state.data,
          normalizeAsyncDataError(error, 'Query consistency check failed')
        ),
        operation
      );
      return;
    }
    // User callbacks may synchronously invalidate, detach or destroy the cell.
    if (!this.isCurrent(operation)) return;
    if (!isConsistent) {
      this.setState(staleQueryState(nextData, 'inconsistent'), operation);
      try {
        await this.reconcile(reconcile, nextData, operation, reconcileSequence);
      } catch (error) {
        if (this.isCurrent(operation)) {
          this.setState(
            errorQueryState(
              this.state.data,
              normalizeAsyncDataError(error, 'Query reconciliation failed')
            ),
            operation
          );
        }
      }
      return;
    }

    this.reconcileAttemptCount = 0;
    this.freshAt = Date.now();
    this.setState(freshQueryState(nextData), operation);
  }

  private async reconcile(
    reconcile: QueryOptions<T>['reconcile'],
    data: T,
    operation: QueryOperation,
    reconcileSequence: number
  ): Promise<void> {
    const shouldRetry = await (reconcile?.(data, { key: this.key }) ?? false);

    if (
      !shouldRetry ||
      reconcileSequence !== this.reconcileSequence ||
      !this.isCurrent(operation)
    ) {
      return;
    }

    this.reconcileAttemptCount += 1;
    if (this.reconcileAttemptCount > RECONCILE_MAX_ATTEMPTS) {
      this.setState(
        staleQueryState(this.state.data, 'inconsistent'),
        operation
      );
      return;
    }

    await new Promise<void>((resolve) =>
      setTimeout(resolve, RECONCILE_RETRY_DELAY_MS)
    );
    if (
      reconcileSequence !== this.reconcileSequence ||
      this.state.consistency === 'fresh' ||
      !this.isCurrent(operation)
    ) {
      return;
    }

    // Reconciliation runs inside the current refresh promise. It must replace
    // that generation rather than coalesce with itself as a manual refresh.
    this.controller?.abort();
    // An abort listener may have created a newer refresh or invalidation.
    if (!this.isCurrent(operation)) return;
    this.queueStart(reconcileSequence, 'reconcile', true);
  }
}

function createCell<T>(
  options: QueryCellOptions<T>,
  cache: Map<string, QueryCell<unknown>>
): QueryCell<T> {
  const cellOptions = options.takeInitialData
    ? {
        ...options,
        initialData: options.takeInitialData() ?? options.initialData,
      }
    : options;
  const cell = new QueryCell(cellOptions, options.key, cache);
  cache.set(options.key, cell as QueryCell<unknown>);
  cell.ensureStarted();
  return cell;
}

function createLegacyQuery<T extends {}>(
  options: QueryCellOptions<T>
): Query<T> {
  validateGcTime(options.gcTime);
  const instance = getCurrentComponentInstance();
  const runtimeState = resolveDataRuntimeState(options.runtime);
  const cache = runtimeState.queryCache;
  const override = runtimeState.queryTestOverrides.get(options.key) as
    | Query<T>
    | undefined;
  if (!instance) {
    if (override) return override;
    let cell = cache.get(options.key) as QueryCell<T> | undefined;
    if (cell?.retireInactiveReaderCacheEntry()) cell = undefined;
    if (!cell) {
      cell = createCell(options, cache);
    } else {
      cell.warnOnConflictingDefinition(options);
    }
    cell.scheduleUnownedCacheEviction(
      options.gcTime ?? DEFAULT_OWNERLESS_GC_TIME_MS
    );
    return cell as unknown as Query<T>;
  }

  const hookIndex = claimHookIndex(instance, 'createQuery');
  ensureQueryCleanup(runtimeState, instance);

  const generation: object = instance;
  const slotStore = getQuerySlotStore(runtimeState, instance);
  const existingSlot = slotStore.get(hookIndex);
  if (existingSlot && existingSlot.key === options.key) {
    (existingSlot.cell as QueryCell<T>).define(options, generation, hookIndex);
    return existingSlot.cell as unknown as Query<T>;
  }

  if (existingSlot) {
    existingSlot.cell.detach(generation, hookIndex);
  }

  if (override) return override;

  const cell =
    (cache.get(options.key) as QueryCell<T> | undefined) ??
    createCell(options, cache);

  slotStore.set(hookIndex, {
    key: options.key,
    cell: cell as QueryCell<unknown>,
  });
  cell.attach(generation, hookIndex);
  cell.define(options, generation, hookIndex);
  cell.ensureStarted();
  return cell as unknown as Query<T>;
}

export function createDefinedQuery<TInput, TResult extends {}>(
  definition: import('./types').QueryDefinition<TInput, TResult>,
  input: TInput,
  options: Omit<QueryOptions<TResult>, 'key' | 'fetch'> = {}
): Query<TResult> {
  const runtime = options.runtime;
  const key = definition.key(input);
  const dataRuntime =
    runtime ??
    (getActiveRenderContext()?.dataRuntime as
      | import('./types').DataRuntime
      | undefined) ??
    getCurrentAppRenderRuntime()?.dataRuntime ??
    getDefaultDataRuntime();
  const serverRender = isServerQueryRender();
  const runtimeState = resolveDataRuntimeState(dataRuntime);
  return createLegacyQuery({
    ...options,
    key,
    definitionIdentity: definition,
    fetch: ({ signal }) => definition.fetch(input, { signal }),
    isConsistent: definition.isConsistent,
    reconcile: definition.reconcile,
    // Server renders read without consuming so the data can be dehydrated.
    takeInitialData: () =>
      readQueryData(runtimeState, key, !serverRender) as TResult | undefined,
    skipInitialFetch: serverRender || options.skipInitialFetch === true,
    runtime: dataRuntime,
  });
}

/**
 * Create a reactive {@link Query} cell bound to the current component, either
 * from inline `options` (key + fetch) or a reusable {@link QueryDefinition}
 * plus its input.
 */
export function createQuery<T extends {}>(options: QueryOptions<T>): Query<T>;
export function createQuery<TInput, TResult extends {}>(
  definition: import('./types').QueryDefinition<TInput, TResult>,
  input: TInput,
  options?: Omit<QueryOptions<TResult>, 'key' | 'fetch'>
): Query<TResult>;
export function createQuery<T extends {}, TInput, TResult extends {}>(
  optionsOrDefinition:
    | QueryOptions<T>
    | import('./types').QueryDefinition<TInput, TResult>,
  input?: TInput,
  options?: Omit<QueryOptions<TResult>, 'key' | 'fetch'>
): Query<T> | Query<TResult> {
  if (
    typeof optionsOrDefinition === 'object' &&
    'key' in optionsOrDefinition &&
    typeof optionsOrDefinition.key === 'function'
  ) {
    return createDefinedQuery(
      optionsOrDefinition as import('./types').QueryDefinition<TInput, TResult>,
      input as TInput,
      options
    );
  }
  return createLegacyQuery(optionsOrDefinition as QueryOptions<T>);
}
