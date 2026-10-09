/** Shared reader definitions and cache windows do not own fetch generations. */
import { logger } from '../common/logger';
import { getActiveRenderContext } from '../common/render-context';
import { schedule, type Job } from '../core/reactive/scheduler';
import type { QueryOptions, QueryState, QueryDefinitionField } from './types';
declare const __ASKR_DEVELOPMENT_BUILD__: boolean;
const MAX_GC_TIME_MS = 2_147_483_647;

export function validateGcTime(gcTime: number | undefined): void {
  if (
    gcTime !== undefined &&
    (!Number.isFinite(gcTime) || gcTime < 0 || gcTime > MAX_GC_TIME_MS)
  ) {
    throw new RangeError(
      'Query gcTime must be a finite, non-negative timer delay.'
    );
  }
}

export type QueryCellOptions<T> = QueryOptions<T> & {
  readonly definitionIdentity?: object;
  /** Supplies `initialData` when a new cell is created for this key. */
  readonly takeInitialData?: () => T | undefined;
};

/** Capabilities invoked at reader-lifetime transitions, in their original order. */
export interface QueryLifetimeWork<T> {
  snapshot(): QueryState<T>;
  retireInactiveFetch(): AbortController | null;
  markRetainedAborted(): void;
  destroyFetch(): void;
  finishPendingRefresh(): void;
}

export class QueryLifetime<T> {
  private options: QueryCellOptions<T>;

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
  private conflictCheck: Job | null = null;

  constructor(
    options: QueryCellOptions<T>,
    private readonly key: string,
    private readonly cache: Pick<Map<string, unknown>, 'get' | 'delete'>,
    private readonly identity: object,
    private readonly work: QueryLifetimeWork<T>
  ) {
    validateGcTime(options.gcTime);
    this.options = options;
  }

  get currentOptions(): QueryCellOptions<T> {
    return this.options;
  }
  get isDestroyed(): boolean {
    return this.destroyed;
  }
  get readerCount(): number {
    return this.ownerCount;
  }
  get inactive(): boolean {
    return this.gcTimer !== null;
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
  }

  detach(generation: object, hookIndex: number): void {
    const hooks = this.owners.get(generation);
    if (!hooks || !hooks.delete(hookIndex)) {
      return;
    }

    this.ownerCount -= 1;
    if (hooks.size === 0) {
      this.owners.delete(generation);
    }

    if (this.ownerCount <= 0) {
      const gcTime = this.options.gcTime ?? 0;
      if (
        gcTime === 0 ||
        this.work.snapshot().data === null ||
        isServerQueryRender()
      ) {
        this.destroy();
      } else {
        const controller = this.work.retireInactiveFetch();
        this.definitionOwner = null;
        this.definitionOwnerHook = -1;
        if (this.work.snapshot().refreshing) {
          this.work.markRetainedAborted();
        }
        this.gcTimer = setTimeout(() => this.destroy(), gcTime);
        // Abort listeners may attach a new reader; complete the inactive
        // transition first so that listener's lifecycle decision survives.
        controller?.abort();
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
    if (isServerQueryRender()) {
      this.warnOnConflictingDefinition(options);
      return;
    }
    this.conflictCheck ??= { run: () => this.warnOnConflictingReaders() };
    schedule(this.conflictCheck, 'render');
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

  destroy(): void {
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
    // Abort listeners may acquire the same key. Retire this lookup identity
    // first, so they create a live cell instead of attaching to this dead one.
    this.evictFromCache();
    this.work.destroyFetch();
    this.ownerCount = 0;
    this.owners.clear();
    this.work.finishPendingRefresh();
  }

  private evictFromCache(): void {
    if (this.cache.get(this.key) === this.identity) this.cache.delete(this.key);
  }

  /** A component's inactive definition must not become an ownerless fetcher. */
  retireInactiveReaderCacheEntry(): boolean {
    if (this.gcTimer === null) return false;
    this.destroy();
    return true;
  }

  /** Ownerless handles stay usable after their cache lookup window expires. */
  scheduleUnownedCacheEviction(gcTime: number): void {
    if (isServerQueryRender() || this.ownerCount > 0 || this.destroyed) return;
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
}

export function isServerQueryRender(): boolean {
  const context = getActiveRenderContext() as { mode?: 'ssr' | 'spa' } | null;
  return (
    context?.mode === 'ssr' ||
    (context?.mode === undefined && typeof window === 'undefined')
  );
}
