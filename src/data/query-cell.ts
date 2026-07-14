import { logger } from '../common/logger';
import { getActiveRenderContext } from '../common/render-context';
import { enqueueRuntimeTask } from '../runtime';
import {
  claimHookIndex,
  getCurrentComponentInstance,
  type ComponentInstance,
} from '../runtime';
import { recordReadableRead } from '../runtime';
import {
  ensureQueryCleanup,
  getQuerySlotStore,
  resolveDataRuntimeState,
} from './data-runtime';
import { getDefaultDataRuntime } from './data-runtime';
import {
  createReadableSource,
  isAbortError,
  normalizeAsyncDataError,
  notifySource,
} from './shared';
import type {
  Query,
  QueryDefinitionField,
  QueryOptions,
  QueryState,
} from './types';

const RECONCILE_MAX_ATTEMPTS = 3;
const RECONCILE_RETRY_DELAY_MS = 25;

export class QueryCell<T> {
  private readonly source = createReadableSource();
  private readonly key: string;
  private readonly cache: Map<string, QueryCell<unknown>>;
  private options: QueryOptions<T>;
  private controller: AbortController | null = null;
  private generation = 0;
  private startQueued = false;
  private pendingRefresh: Promise<void> | null = null;
  private pendingRefreshResolve: (() => void) | null = null;
  private pendingRefreshToken = 0;
  private reconcileAttemptCount = 0;
  private destroyed = false;
  private ownerCount = 0;
  private readonly owners = new Map<ComponentInstance, Set<number>>();
  private readonly warnedDefinitionConflictKeys = new Set<string>();

  private state: QueryState<T> = {
    data: null,
    error: null,
    loading: true,
    refreshing: false,
    stale: false,
    consistency: 'fresh',
    staleReason: null,
  };

  constructor(
    options: QueryOptions<T>,
    key: string,
    cache: Map<string, QueryCell<unknown>>
  ) {
    this.options = options;
    this.key = key;
    this.cache = cache;
    if (options.initialData !== undefined) {
      this.state = { data: options.initialData, error: null, loading: false, refreshing: false, stale: false, consistency: 'fresh', staleReason: null };
    }
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

  warnOnConflictingDefinition(options: QueryOptions<T>): void {
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
    this.controller?.abort();
    this.controller = null;
    this.startQueued = false;
    this.reconcileAttemptCount = 0;
    this.ownerCount = 0;
    this.owners.clear();
    this.cache.delete(this.key);
    this.finishPendingRefresh();
  }

  private getDefinitionConflicts(
    options: QueryOptions<T>
  ): QueryDefinitionField[] {
    const conflicts: QueryDefinitionField[] = [];

    if (this.options.fetch !== options.fetch) {
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

  ensureStarted(): void {
    if (
      this.destroyed ||
      this.state.data !== null ||
      this.pendingRefresh ||
      this.startQueued
      || this.options.skipInitialFetch
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

  invalidate(): void {
    if (this.destroyed) {
      return;
    }

    if (this.pendingRefresh) {
      // Invalidation supersedes stale work. Manual refreshes, by contrast,
      // are equivalent requests and share the in-flight generation.
      this.controller?.abort();
      this.finishPendingRefresh(this.pendingRefreshToken);
    }

    this.queueStart('invalidate');
  }

  markPendingWrite(): void {
    if (this.destroyed) {
      return;
    }

    if (this.state.data === null) {
      return;
    }

    this.setState({
      loading: false,
      error: null,
      refreshing: true,
      stale: true,
      consistency: 'pending-write',
      staleReason: null,
    });
  }

  private queueStart(
    reason: 'initial' | 'manual' | 'invalidate' | 'pending-write'
  ): void {
    if (this.destroyed) {
      return;
    }

    this.startQueued = true;
    const token = ++this.pendingRefreshToken;
    this.pendingRefresh = new Promise<void>((resolve) => {
      this.pendingRefreshResolve = resolve;
      enqueueRuntimeTask(() => {
        this.startQueued = false;
        if (this.destroyed) {
          this.finishPendingRefresh(token);
          return;
        }
        void this.start(reason).finally(() => {
          this.finishPendingRefresh(token);
        });
      });
    });
  }

  private finishPendingRefresh(token = this.pendingRefreshToken): void {
    if (token !== this.pendingRefreshToken) {
      return;
    }
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
      staleReason: null,
    });

    let nextData: T;
    try {
      nextData = await this.options.fetch({ signal: controller.signal });
    } catch (error) {
      if (
        this.destroyed ||
        this.generation !== generation ||
        this.controller !== controller
      ) {
        return;
      }

      if (isAbortError(error, controller.signal)) {
        this.setState(
          hasData
            ? {
                loading: false,
                refreshing: false,
                stale: true,
                consistency: 'stale',
                error: null,
                staleReason: 'aborted',
              }
            : {
                loading: true,
                refreshing: false,
                stale: false,
                consistency: 'fresh',
                error: null,
                staleReason: null,
              }
        );
        return;
      }

      this.setState({
        loading: false,
        refreshing: false,
        stale: true,
        consistency: 'stale',
        error: normalizeAsyncDataError(error, 'Unknown query error'),
        staleReason: 'error',
      });
      return;
    }

    if (
      this.destroyed ||
      this.generation !== generation ||
      this.controller !== controller
    ) {
      return;
    }

    let isConsistent: boolean;
    try {
      isConsistent = this.options.isConsistent?.(nextData) ?? true;
    } catch (error) {
      this.setState({
        loading: false,
        refreshing: false,
        stale: true,
        consistency: 'stale',
        error: normalizeAsyncDataError(error, 'Query consistency check failed'),
        staleReason: 'error',
      });
      return;
    }
    if (!isConsistent) {
      this.setState({
        data: nextData,
        loading: false,
        refreshing: false,
        stale: true,
        consistency: 'stale',
        staleReason: 'inconsistent',
      });
      try {
        await this.reconcile(nextData);
      } catch (error) {
        if (this.generation === generation && this.controller === controller) {
          this.setState({
            loading: false,
            refreshing: false,
            stale: true,
            consistency: 'stale',
            error: normalizeAsyncDataError(
              error,
              'Query reconciliation failed'
            ),
            staleReason: 'error',
          });
        }
      }
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
      staleReason: null,
    });
  }

  private async reconcile(data: T): Promise<void> {
    const shouldRetry = await (this.options.reconcile?.(data, {
      key: this.options.key,
    }) ?? false);

    if (!shouldRetry || this.destroyed) {
      return;
    }

    this.reconcileAttemptCount += 1;
    if (this.reconcileAttemptCount > RECONCILE_MAX_ATTEMPTS) {
      this.setState({
        consistency: 'stale',
        refreshing: false,
        staleReason: 'inconsistent',
      });
      return;
    }

    await new Promise<void>((resolve) =>
      setTimeout(resolve, RECONCILE_RETRY_DELAY_MS)
    );
    if (this.destroyed || this.state.consistency === 'fresh') {
      return;
    }

    // Reconciliation runs inside the current refresh promise. It must replace
    // that generation rather than coalesce with itself as a manual refresh.
    this.invalidate();
  }
}

function createLegacyQuery<T extends {}>(options: QueryOptions<T>): Query<T> {
  const instance = getCurrentComponentInstance();
  const runtimeState = resolveDataRuntimeState(options.runtime);
  const cache = runtimeState.queryCache;
  if (!instance) {
    let cell = cache.get(options.key) as QueryCell<T> | undefined;
    if (!cell) {
      cell = new QueryCell(options, options.key, cache);
      cache.set(options.key, cell as QueryCell<unknown>);
      cell.ensureStarted();
    } else {
      cell.warnOnConflictingDefinition(options);
    }
    return cell as unknown as Query<T>;
  }

  const hookIndex = claimHookIndex(instance, 'query');
  ensureQueryCleanup(runtimeState, instance);

  const slotStore = getQuerySlotStore(runtimeState, instance);
  const existingSlot = slotStore.get(hookIndex);
  if (existingSlot && existingSlot.key === options.key) {
    (existingSlot.cell as QueryCell<T>).warnOnConflictingDefinition(options);
    return existingSlot.cell as unknown as Query<T>;
  }

  if (existingSlot) {
    existingSlot.cell.detach(instance, hookIndex);
  }

  let cell = cache.get(options.key) as QueryCell<T> | undefined;
  if (!cell) {
    cell = new QueryCell(options, options.key, cache);
    cache.set(options.key, cell as QueryCell<unknown>);
    cell.ensureStarted();
  } else {
    cell.warnOnConflictingDefinition(options);
  }

  slotStore.set(hookIndex, {
    key: options.key,
    cell: cell as QueryCell<unknown>,
  });
  cell.attach(instance, hookIndex);
  return cell as unknown as Query<T>;
}

export function createDefinedQuery<TInput, TResult extends {}>(
  definition: import('./types').QueryDefinition<TInput, TResult>,
  input: TInput,
  options: Omit<QueryOptions<TResult>, 'key' | 'fetch'> = {}
): Query<TResult> {
  const runtime = options.runtime;
  const context = (getActiveRenderContext() as { mode?: 'ssr' | 'spa' } | null);
  const key = definition.key(input);
  const dataRuntime = runtime ?? (getActiveRenderContext()?.dataRuntime as import('./types').DataRuntime | undefined) ?? getDefaultDataRuntime();
  const initialData = dataRuntime?.queryData.get(key) as TResult | undefined;
  return createLegacyQuery({
    ...options,
    key,
    fetch: ({ signal }) => definition.fetch({ ...input, signal }),
    isConsistent: definition.isConsistent,
    reconcile: definition.reconcile,
    initialData,
    skipInitialFetch: context?.mode === 'ssr' || (context?.mode === undefined && typeof window === 'undefined'),
    runtime: dataRuntime ?? options.runtime,
  });
}

export function createQuery<T extends {}>(options: QueryOptions<T>): Query<T>;
export function createQuery<TInput, TResult extends {}>(
  definition: import('./types').QueryDefinition<TInput, TResult>,
  input: TInput,
  options?: Omit<QueryOptions<TResult>, 'key' | 'fetch'>
): Query<TResult>;
export function createQuery<T extends {}, TInput, TResult extends {}>(
  optionsOrDefinition: QueryOptions<T> | import('./types').QueryDefinition<TInput, TResult>,
  input?: TInput,
  options?: Omit<QueryOptions<TResult>, 'key' | 'fetch'>
): Query<T> | Query<TResult> {
  if (typeof optionsOrDefinition === 'object' && 'key' in optionsOrDefinition && typeof optionsOrDefinition.key === 'function') {
    return createDefinedQuery(optionsOrDefinition as import('./types').QueryDefinition<TInput, TResult>, input as TInput, options);
  }
  return createLegacyQuery(optionsOrDefinition as QueryOptions<T>);
}
