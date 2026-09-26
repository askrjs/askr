import {
  loadingQueryState,
  freshQueryState,
  refreshingQueryState,
  staleQueryState,
  errorQueryState,
} from './query-state';
import { getComponentLifetimeIdentity } from '../runtime/component/capabilities';
import { logger } from '../common/logger';
import { getActiveRenderContext } from '../common/render-context';
import {
  adjustOwnershipDiagnostic,
  requestRuntimeWork,
  ScheduledWork,
} from '../runtime';
import {
  claimHookIndex,
  getCurrentAppRenderRuntime,
  getCurrentComponentInstance,
} from '../runtime';
import { recordReadableRead } from '../runtime';
import {
  ensureQueryCleanup,
  getQuerySlotStore,
  readQueryData,
  resolveDataRuntimeState,
} from './data-runtime';
import { getDefaultDataRuntime } from './data-runtime';
import {
  createReadableSource,
  isAbortError,
  isCurrentAsyncOperation,
  normalizeAsyncDataError,
  notifySource,
} from './shared';
import type {
  Query,
  QueryDefinitionField,
  QueryOptions,
  QueryState,
} from './types';
declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const RECONCILE_MAX_ATTEMPTS = 3;
const RECONCILE_RETRY_DELAY_MS = 25;
const MAX_GC_TIME_MS = 2_147_483_647;
const DEFAULT_OWNERLESS_GC_TIME_MS = 5 * 60_000;

function validateGcTime(gcTime: number | undefined): void {
  if (
    gcTime !== undefined &&
    (!Number.isFinite(gcTime) || gcTime < 0 || gcTime > MAX_GC_TIME_MS)
  ) {
    throw new RangeError(
      'Query gcTime must be a finite, non-negative timer delay.'
    );
  }
}

type QueryCellOptions<T> = QueryOptions<T> & {
  readonly definitionIdentity?: object;
  /** Supplies `initialData` when a new cell is created for this key. */
  readonly takeInitialData?: () => T | undefined;
};

class QueryStartWork extends ScheduledWork {
  constructor(
    run: () => void,
    private readonly settle: () => void
  ) {
    super(run);
  }

  protected override cancel(): void {
    super.cancel();
    this.settle();
  }
}

export class QueryCell<T> {
  private readonly source = createReadableSource();
  private readonly key: string;
  private readonly cache: Map<string, QueryCell<unknown>>;
  private options: QueryCellOptions<T>;
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
  private destroyed = false;
  private ownerCount = 0;
  private gcTimer: ReturnType<typeof setTimeout> | null = null;
  private unownedTimer: ReturnType<typeof setTimeout> | null = null;
  // Attached readers by lifetime and hook slot, with each reader's latest
  // definition (null until the reader defines one).
  private readonly owners = new Map<
    object,
    Map<number, QueryCellOptions<T> | null>
  >();
  private readonly warnedDefinitionConflictKeys = new Set<string>();
  // The reader whose render supplied `options`. Its later renders replace the
  // definition, so inline callbacks never go stale or read as conflicts.
  private definitionOwner: object | null = null;
  private definitionOwnerHook = -1;
  // Reader conflicts are checked after the current render work settles, so a
  // reader replacing the owner (e.g. a keyed row swap) is not a conflict.
  private conflictCheck: ScheduledWork | null = null;

  private state: QueryState<T> = loadingQueryState<T>();

  constructor(
    options: QueryCellOptions<T>,
    key: string,
    cache: Map<string, QueryCell<unknown>>
  ) {
    validateGcTime(options.gcTime);
    this.options = options;
    this.key = key;
    this.cache = cache;
    if (__ASKR_DEVELOPMENT_BUILD__) {
      adjustOwnershipDiagnostic('queryCells', 1);
    }
    if (options.initialData !== undefined) {
      this.state = freshQueryState(options.initialData);
    }
  }

  attach(generation: object, hookIndex: number): void {
    if (this.unownedTimer !== null) {
      clearTimeout(this.unownedTimer);
      this.unownedTimer = null;
    }
    if (this.gcTimer !== null) {
      clearTimeout(this.gcTimer);
      this.gcTimer = null;
    }
    let hooks = this.owners.get(generation);
    if (!hooks) {
      hooks = new Map();
      this.owners.set(generation, hooks);
    }

    if (hooks.has(hookIndex)) {
      return;
    }

    hooks.set(hookIndex, null);
    this.ownerCount += 1;
    if (__ASKR_DEVELOPMENT_BUILD__) {
      adjustOwnershipDiagnostic('queryOwners', 1);
    }
  }

  detach(generation: object, hookIndex: number): void {
    const hooks = this.owners.get(generation);
    if (!hooks || !hooks.delete(hookIndex)) {
      return;
    }

    this.ownerCount -= 1;
    if (__ASKR_DEVELOPMENT_BUILD__) {
      adjustOwnershipDiagnostic('queryOwners', -1);
    }
    if (hooks.size === 0) {
      this.owners.delete(generation);
    }

    if (this.ownerCount <= 0) {
      const gcTime = this.options.gcTime ?? 0;
      if (gcTime === 0 || this.state.data === null || isServerRender()) {
        this.destroy();
      } else {
        this.generation += 1;
        this.controller?.abort();
        this.controller = null;
        this.finishPendingRefresh();
        this.definitionOwner = null;
        this.definitionOwnerHook = -1;
        this.gcTimer = setTimeout(() => this.destroy(), gcTime);
      }
      return;
    }

    if (
      this.definitionOwner === generation &&
      this.definitionOwnerHook === hookIndex
    ) {
      this.promoteDefinitionOwner();
    }
  }

  // Hand the definition to a remaining reader so the cell never keeps
  // fetching through an unmounted reader's callbacks.
  private promoteDefinitionOwner(): void {
    this.definitionOwner = null;
    for (const [generation, hooks] of this.owners) {
      for (const [hookIndex, options] of hooks) {
        if (options) {
          this.options = options;
          this.definitionOwner = generation;
          this.definitionOwnerHook = hookIndex;
          return;
        }
      }
    }
  }

  /**
   * Record an attached reader's definition for this key. The owning reader's
   * renders replace the definition; with no owner, the reader takes over.
   * Other readers are checked for conflicts once render work settles.
   */
  define(
    options: QueryCellOptions<T>,
    generation: object,
    hookIndex: number
  ): void {
    validateGcTime(options.gcTime);
    const hooks = this.owners.get(generation);
    if (this.destroyed || !hooks?.has(hookIndex)) {
      return;
    }
    hooks.set(hookIndex, options);

    if (
      this.definitionOwner === null ||
      (this.definitionOwner === generation &&
        this.definitionOwnerHook === hookIndex)
    ) {
      this.options = options;
      this.definitionOwner = generation;
      this.definitionOwnerHook = hookIndex;
      return;
    }

    if (!__ASKR_DEVELOPMENT_BUILD__) {
      return;
    }
    const conflicts = this.getDefinitionConflicts(options);
    if (
      conflicts.length === 0 ||
      this.warnedDefinitionConflictKeys.has(conflicts.join(','))
    ) {
      return;
    }
    // Server renders never swap readers, and their cells are torn down before
    // scheduled work would run.
    if (isServerRender()) {
      this.warnOnConflictingDefinition(options);
      return;
    }
    this.conflictCheck ??= new ScheduledWork(() =>
      this.warnOnConflictingReaders()
    );
    requestRuntimeWork('component', this.conflictCheck);
  }

  private warnOnConflictingReaders(): void {
    if (this.destroyed) {
      return;
    }
    for (const hooks of this.owners.values()) {
      for (const options of hooks.values()) {
        if (options) {
          this.warnOnConflictingDefinition(options);
        }
      }
    }
  }

  warnOnConflictingDefinition(options: QueryCellOptions<T>): void {
    const conflicts = this.getDefinitionConflicts(options);
    if (conflicts.length === 0) {
      return;
    }

    const conflictKey = conflicts.join(',');
    if (this.warnedDefinitionConflictKeys.has(conflictKey)) {
      return;
    }

    this.warnedDefinitionConflictKeys.add(conflictKey);

    const callbackLabel =
      conflicts.length === 1
        ? `callback \`${conflicts[0]}\``
        : `callbacks ${conflicts.map((field) => `\`${field}\``).join(', ')}`;

    logger.warn(
      `[askr] Conflicting shared query definition for key "${this.key}". ` +
        `Shared queries are canonical by key, so reuse the same ${callbackLabel} ` +
        'for every reader of that key.'
    );
  }

  private destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    if (this.gcTimer !== null) {
      clearTimeout(this.gcTimer);
      this.gcTimer = null;
    }
    if (this.unownedTimer !== null) {
      clearTimeout(this.unownedTimer);
      this.unownedTimer = null;
    }
    if (__ASKR_DEVELOPMENT_BUILD__) {
      adjustOwnershipDiagnostic('queryCells', -1);
    }
    this.controller?.abort();
    this.controller = null;
    this.reconcileAttemptCount = 0;
    this.ownerCount = 0;
    this.owners.clear();
    this.evictFromCache();
    this.finishPendingRefresh();
  }

  private evictFromCache(): void {
    if (this.cache.get(this.key) === this) this.cache.delete(this.key);
  }

  /** A component's inactive definition must not become an ownerless fetcher. */
  retireInactiveReaderCacheEntry(): boolean {
    if (this.gcTimer === null) return false;
    this.destroy();
    return true;
  }

  /** Ownerless handles stay usable after their cache lookup window expires. */
  scheduleUnownedCacheEviction(gcTime: number): void {
    if (isServerRender() || this.ownerCount > 0 || this.destroyed) return;
    if (this.unownedTimer !== null) clearTimeout(this.unownedTimer);
    this.unownedTimer = null;
    if (gcTime === 0) {
      this.evictFromCache();
      return;
    }
    this.unownedTimer = setTimeout(() => {
      this.unownedTimer = null;
      if (this.ownerCount === 0) this.evictFromCache();
    }, gcTime);
  }

  private getDefinitionConflicts(
    options: QueryCellOptions<T>
  ): QueryDefinitionField[] {
    const conflicts: QueryDefinitionField[] = [];

    const currentFetchIdentity =
      this.options.definitionIdentity ?? this.options.fetch;
    const nextFetchIdentity = options.definitionIdentity ?? options.fetch;
    if (currentFetchIdentity !== nextFetchIdentity) {
      conflicts.push('fetch');
    }

    if (this.options.isConsistent !== options.isConsistent) {
      conflicts.push('isConsistent');
    }

    if (this.options.reconcile !== options.reconcile) {
      conflicts.push('reconcile');
    }

    return conflicts;
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
    if (this.gcTimer !== null) {
      this.destroy();
      return Promise.resolve();
    }

    if (this.pendingRefresh) {
      if (this.pendingRefreshKind === 'invalidation') {
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
    if (this.gcTimer !== null) {
      this.destroy();
      return Promise.resolve();
    }

    if (this.pendingRefresh) {
      // Invalidation supersedes stale work. Manual refreshes, by contrast,
      // are equivalent requests and share the in-flight generation.
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
    requestRuntimeWork(
      'component',
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
      )
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

  private setState(next: QueryState<T>): void {
    if (this.destroyed) {
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

    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    const hasData = this.state.data !== null;
    this.setState(
      hasData ? refreshingQueryState(this.state.data!) : loadingQueryState<T>()
    );

    // An in-flight fetch keeps the definition it started with, even if the
    // owning reader re-renders with new callbacks before it settles.
    const { fetch, isConsistent: checkConsistent, reconcile } = this.options;
    let nextData: T;
    try {
      nextData = await fetch({ signal: controller.signal });
    } catch (error) {
      if (
        this.destroyed ||
        !isCurrentAsyncOperation(
          this.generation,
          generation,
          this.controller,
          controller
        )
      ) {
        return;
      }

      if (isAbortError(error, controller.signal)) {
        this.setState(
          hasData
            ? staleQueryState(this.state.data, 'aborted')
            : loadingQueryState<T>()
        );
        return;
      }

      this.setState(
        errorQueryState(
          this.state.data,
          normalizeAsyncDataError(error, 'Unknown query error')
        )
      );
      return;
    }

    if (
      this.destroyed ||
      !isCurrentAsyncOperation(
        this.generation,
        generation,
        this.controller,
        controller
      )
    ) {
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
        )
      );
      return;
    }
    if (!isConsistent) {
      this.setState(staleQueryState(nextData, 'inconsistent'));
      try {
        await this.reconcile(
          reconcile,
          nextData,
          generation,
          controller,
          reconcileSequence
        );
      } catch (error) {
        if (
          isCurrentAsyncOperation(
            this.generation,
            generation,
            this.controller,
            controller
          )
        ) {
          this.setState(
            errorQueryState(
              this.state.data,
              normalizeAsyncDataError(error, 'Query reconciliation failed')
            )
          );
        }
      }
      return;
    }

    this.reconcileAttemptCount = 0;
    this.setState(freshQueryState(nextData));
  }

  private async reconcile(
    reconcile: QueryOptions<T>['reconcile'],
    data: T,
    generation: number,
    controller: AbortController,
    reconcileSequence: number
  ): Promise<void> {
    const shouldRetry = await (reconcile?.(data, { key: this.key }) ?? false);

    if (
      !shouldRetry ||
      this.destroyed ||
      reconcileSequence !== this.reconcileSequence ||
      !isCurrentAsyncOperation(
        this.generation,
        generation,
        this.controller,
        controller
      )
    ) {
      return;
    }

    this.reconcileAttemptCount += 1;
    if (this.reconcileAttemptCount > RECONCILE_MAX_ATTEMPTS) {
      this.setState(staleQueryState(this.state.data, 'inconsistent'));
      return;
    }

    await new Promise<void>((resolve) =>
      setTimeout(resolve, RECONCILE_RETRY_DELAY_MS)
    );
    if (
      this.destroyed ||
      reconcileSequence !== this.reconcileSequence ||
      this.state.consistency === 'fresh' ||
      !isCurrentAsyncOperation(
        this.generation,
        generation,
        this.controller,
        controller
      )
    ) {
      return;
    }

    // Reconciliation runs inside the current refresh promise. It must replace
    // that generation rather than coalesce with itself as a manual refresh.
    this.controller?.abort();
    this.queueStart(reconcileSequence, 'reconcile', true);
  }
}

function isServerRender(): boolean {
  const context = getActiveRenderContext() as { mode?: 'ssr' | 'spa' } | null;
  return (
    context?.mode === 'ssr' ||
    (context?.mode === undefined && typeof window === 'undefined')
  );
}

function createCell<T>(
  options: QueryCellOptions<T>,
  cache: Map<string, QueryCell<unknown>>
): QueryCell<T> {
  const cellOptions = options.takeInitialData
    ? { ...options, initialData: options.takeInitialData() }
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

  const generation = getComponentLifetimeIdentity(instance);
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
  const serverRender = isServerRender();
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
    skipInitialFetch: serverRender,
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
