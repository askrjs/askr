import { getActiveRenderContext } from '../common/render-context';
import {
  claimHookIndex,
  onRenderDiscard,
  currentComponent as getCurrentComponentInstance,
} from '../core/api/hooks';
import {
  assertDataRuntimeActive,
  registerDataRuntimeOwner,
  readQueryData,
  resolveDataRuntimeState,
  type DataRuntimeState,
} from './data-runtime';
import { QueryCell } from './query-cell';
import {
  createReadableSource,
  notifySource,
  recordReadableRead,
} from './shared';
import {
  invalidateCollectionCell,
  registerCollectionCell,
  unregisterCollectionCell,
  type CollectionInvalidator,
} from './collection-invalidation';
import type {
  Query,
  QueryCollection,
  QueryCollectionEntry,
  QueryCollectionKey,
  QueryCollectionOptions,
  QueryDefinition,
} from './types';

const DEFAULT_QUERY_COLLECTION_CONCURRENCY = 4;

type CollectionRecord<
  TInput,
  TResult extends {},
  TKey extends QueryCollectionKey,
> = QueryCollectionEntry<TInput, TResult, TKey> & {
  input: TInput;
  readonly queryKey: string;
  readonly cell: QueryCell<TResult>;
  readonly owner: object;
  readonly initialData: TResult | undefined;
  readonly hasInitialData: boolean;
};

type CollectionTask<TResult extends {}> = {
  readonly cell: QueryCell<TResult>;
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  state: 'queued' | 'active' | 'cancelled' | 'done';
  kind: 'refresh' | 'invalidation';
};

type QueryCollectionSlot = {
  readonly runtimeState: DataRuntimeState;
  readonly collection: QueryCollectionCell<unknown, {}, QueryCollectionKey>;
};

const collectionSlotsByGeneration = new WeakMap<
  object,
  Map<number, QueryCollectionSlot>
>();

/** @internal Validate and normalize a query collection's concurrency cap. */
export function normalizeQueryCollectionConcurrency(
  concurrency: number | undefined
): number {
  const value = concurrency ?? DEFAULT_QUERY_COLLECTION_CONCURRENCY;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      '[Askr] createQueryCollection() concurrency must be a positive integer.'
    );
  }
  return value;
}

function getCollectionStore(
  generation: object
): Map<number, QueryCollectionSlot> {
  let store = collectionSlotsByGeneration.get(generation);
  if (!store) {
    store = new Map();
    collectionSlotsByGeneration.set(generation, store);
  }
  return store;
}

function createCellOptions<TInput, TResult extends {}>(
  query: QueryDefinition<TInput, TResult>,
  input: TInput,
  queryKey: string
) {
  return {
    key: queryKey,
    definitionIdentity: query,
    fetch: ({ signal }: { signal: AbortSignal }) =>
      query.fetch(input, { signal }),
    isConsistent: query.isConsistent,
    reconcile: query.reconcile,
    skipInitialFetch: true,
  };
}

class QueryCollectionCell<
  TInput,
  TResult extends {},
  TKey extends QueryCollectionKey,
>
  implements QueryCollection<TInput, TResult, TKey>, CollectionInvalidator
{
  private readonly source = createReadableSource();
  private records = new Map<TKey, CollectionRecord<TInput, TResult, TKey>>();
  private committedRecords = new Map<
    TKey,
    CollectionRecord<TInput, TResult, TKey>
  >();
  private ordered: readonly CollectionRecord<TInput, TResult, TKey>[] = [];
  private registeredCells = new Set<QueryCell<TResult>>();
  private readonly tasks = new Map<
    QueryCell<TResult>,
    CollectionTask<TResult>
  >();
  private readonly queue: CollectionTask<TResult>[] = [];
  private readonly consumedInitialData = new WeakSet<QueryCell<TResult>>();
  private activeCount = 0;
  private concurrency = DEFAULT_QUERY_COLLECTION_CONCURRENCY;
  private updateRevision = 0;
  private disposed = false;

  private readonly unregisterRuntimeOwner: () => void;

  constructor(private readonly runtimeState: DataRuntimeState) {
    this.unregisterRuntimeOwner = registerDataRuntimeOwner(runtimeState, this);
  }

  retire(): void {
    try {
      this.dispose();
    } finally {
      notifySource(this.source);
    }
  }

  get invalidationConcurrency(): number {
    return this.concurrency;
  }

  invalidateCell(cell: object): void {
    const ownedCell = cell as QueryCell<TResult>;
    const task = this.tasks.get(ownedCell);
    if (task?.state === 'active') {
      void ownedCell.invalidate();
      return;
    }
    ownedCell.markQueuedInvalidation();
    void this.schedule(ownedCell, 'invalidation');
  }

  hasPendingCell(cell: object): boolean {
    const state = this.tasks.get(cell as QueryCell<TResult>)?.state;
    return state === 'queued' || state === 'active';
  }

  get entries(): readonly QueryCollectionEntry<TInput, TResult, TKey>[] {
    recordReadableRead(this.source);
    return this.runtimeState.retired ? [] : this.ordered;
  }

  get loading(): boolean {
    recordReadableRead(this.source);
    return (
      !this.runtimeState.retired &&
      this.ordered.some(({ query }) => query.loading || query.refreshing)
    );
  }

  get settled(): boolean {
    return !this.loading;
  }

  get results(): ReadonlyMap<TKey, TResult> {
    recordReadableRead(this.source);
    const results = new Map<TKey, TResult>();
    for (const { key, query } of this.ordered) {
      if (query.data !== null) {
        results.set(key, query.data);
      }
    }
    return results;
  }

  get errors(): ReadonlyMap<TKey, {}> {
    recordReadableRead(this.source);
    const errors = new Map<TKey, {}>();
    if (this.runtimeState.retired) return errors;
    for (const { key, query } of this.ordered) {
      if (query.error !== null) {
        errors.set(key, query.error);
      }
    }
    return errors;
  }

  get(key: TKey): QueryCollectionEntry<TInput, TResult, TKey> | undefined {
    recordReadableRead(this.source);
    return this.runtimeState.retired ? undefined : this.records.get(key);
  }

  retry(key: TKey): Promise<void> {
    assertDataRuntimeActive(this.runtimeState);
    const record = this.records.get(key);
    return record ? this.schedule(record.cell) : Promise.resolve();
  }

  update(
    query: QueryDefinition<TInput, TResult>,
    inputs: readonly TInput[],
    keyForInput: (input: TInput) => TKey,
    concurrency: number,
    startInitialFetches: boolean
  ): () => void {
    if (this.disposed) return () => {};

    const previousRecords = this.records;
    const previousOrdered = this.ordered;
    const revision = ++this.updateRevision;
    const desired: Array<{ input: TInput; key: TKey; queryKey: string }> = [];
    const seenKeys = new Set<TKey>();
    for (const input of inputs) {
      const key = keyForInput(input);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      desired.push({ input, key, queryKey: query.key(input) });
    }

    const nextRecords = new Map<
      TKey,
      CollectionRecord<TInput, TResult, TKey>
    >();
    const nextOrdered: CollectionRecord<TInput, TResult, TKey>[] = [];
    const startCandidates = new Set<QueryCell<TResult>>();
    const provisionalRecords: CollectionRecord<TInput, TResult, TKey>[] = [];

    for (const { input, key, queryKey } of desired) {
      const cellOptions = createCellOptions(query, input, queryKey);
      const previous = this.records.get(key);
      let record: CollectionRecord<TInput, TResult, TKey>;

      if (previous?.queryKey === queryKey) {
        record = { ...previous, input };
      } else {
        const cache = this.runtimeState.queryCache;
        let cell = cache.get(queryKey) as QueryCell<TResult> | undefined;
        let provisional = false;
        const hasInitialData =
          !cell && this.runtimeState.queryData.has(queryKey);
        const initialData = hasInitialData
          ? (this.runtimeState.queryData.get(queryKey) as TResult)
          : undefined;
        if (!cell) {
          cell = new QueryCell(
            { ...cellOptions, initialData },
            queryKey,
            cache,
            this.runtimeState
          );
          cache.set(queryKey, cell as QueryCell<unknown>);
          provisional = true;
        }

        const owner = {};
        if (provisional) {
          cell.attach(owner, 0);
          cell.define(cellOptions, owner, 0);
        }
        record = {
          key,
          input,
          query: cell as unknown as Query<TResult>,
          queryKey,
          cell,
          owner,
          initialData,
          hasInitialData,
        };
        if (provisional) provisionalRecords.push(record);
        if (startInitialFetches && cell.needsInitialStart()) {
          startCandidates.add(cell);
        }
      }

      nextRecords.set(key, record);
      nextOrdered.push(record);
    }

    this.records = nextRecords;
    this.ordered = Object.freeze(nextOrdered);
    onRenderDiscard(() => {
      if (this.disposed) return;
      if (this.updateRevision !== revision) return;
      this.records = previousRecords;
      this.ordered = previousOrdered;
      this.updateRevision -= 1;
      for (const record of provisionalRecords) {
        record.cell.detach(record.owner, 0);
      }
    });

    return () => {
      if (this.disposed || this.updateRevision !== revision) return;

      const previousCommittedRecords = this.committedRecords;
      const nextCells = new Set(
        Array.from(nextRecords.values(), (record) => record.cell)
      );
      const nextOwners = new Set(
        Array.from(nextRecords.values(), (record) => record.owner)
      );
      for (const record of nextRecords.values()) {
        record.cell.attach(record.owner, 0);
        record.cell.define(
          createCellOptions(query, record.input, record.queryKey),
          record.owner,
          0
        );
        if (
          startInitialFetches &&
          record.hasInitialData &&
          !this.consumedInitialData.has(record.cell) &&
          this.runtimeState.queryData.get(record.queryKey) ===
            record.initialData
        ) {
          readQueryData(this.runtimeState, record.queryKey, true);
          this.consumedInitialData.add(record.cell);
        }
      }

      const registeredCells = nextCells;
      for (const cell of this.registeredCells) {
        if (!registeredCells.has(cell)) unregisterCollectionCell(cell, this);
      }
      for (const cell of registeredCells) {
        if (!this.registeredCells.has(cell)) registerCollectionCell(cell, this);
      }
      this.registeredCells = registeredCells;
      this.committedRecords = nextRecords;

      const detachedCells = new Set<QueryCell<TResult>>();
      for (const record of previousCommittedRecords.values()) {
        if (!nextOwners.has(record.owner)) {
          record.cell.detach(record.owner, 0);
          detachedCells.add(record.cell);
        }
      }
      this.concurrency = concurrency;
      for (const cell of detachedCells) this.cancelIfUnused(cell);
      for (const cell of startCandidates) {
        if (cell.needsInitialStart()) this.schedule(cell);
      }
      this.pump();
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.updateRevision += 1;
    this.unregisterRuntimeOwner();

    for (const cell of this.registeredCells) {
      unregisterCollectionCell(cell, this);
    }
    this.registeredCells.clear();
    const cells = new Set<QueryCell<TResult>>();
    const records = new Set([
      ...this.records.values(),
      ...this.committedRecords.values(),
    ]);
    for (const record of records) {
      cells.add(record.cell);
      record.cell.detach(record.owner, 0);
    }
    this.records.clear();
    this.committedRecords.clear();
    this.ordered = [];
    for (const cell of cells) this.cancelIfUnused(cell);
    this.queue.length = 0;
  }

  private isCellUsed(cell: QueryCell<TResult>): boolean {
    for (const record of this.records.values()) {
      if (record.cell === cell) return true;
    }
    return false;
  }

  private cancelIfUnused(cell: QueryCell<TResult>): void {
    if (this.isCellUsed(cell)) return;
    const task = this.tasks.get(cell);
    if (!task || task.state === 'cancelled' || task.state === 'done') return;

    if (task.state === 'active') this.activeCount -= 1;
    const rescheduleInvalidation =
      task.state === 'queued' && task.kind === 'invalidation';
    task.state = 'cancelled';
    this.tasks.delete(cell);
    task.resolve();
    if (
      !this.runtimeState.retired &&
      rescheduleInvalidation &&
      !invalidateCollectionCell(cell)
    ) {
      void cell.invalidate();
    }
    this.pump();
  }

  private schedule(
    cell: QueryCell<TResult>,
    kind: CollectionTask<TResult>['kind'] = 'refresh'
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const existing = this.tasks.get(cell);
    if (existing) {
      if (kind === 'invalidation') existing.kind = kind;
      return existing.promise;
    }

    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const task: CollectionTask<TResult> = {
      cell,
      promise,
      resolve,
      state: 'queued',
      kind,
    };
    this.tasks.set(cell, task);
    this.queue.push(task);
    this.pump();
    return promise;
  }

  private pump(): void {
    if (this.disposed || this.runtimeState.retired) return;
    while (this.activeCount < this.concurrency) {
      const task = this.queue.shift();
      if (!task) return;
      if (task.state !== 'queued' || this.tasks.get(task.cell) !== task) {
        continue;
      }

      task.state = 'active';
      this.activeCount += 1;
      const work =
        task.kind === 'invalidation'
          ? task.cell.invalidate()
          : task.cell.refresh();
      void work.finally(() => this.finish(task));
    }
  }

  private finish(task: CollectionTask<TResult>): void {
    if (task.state !== 'active') return;
    task.state = 'done';
    this.activeCount -= 1;
    if (this.tasks.get(task.cell) === task) this.tasks.delete(task.cell);
    task.resolve();
    this.pump();
  }
}

/**
 * Create one lifecycle-owned collection of dynamically keyed readers for a
 * reusable query definition, with bounded collection-started fetches.
 */
export function createQueryCollection<
  TInput,
  TResult extends {},
  TKey extends QueryCollectionKey = string,
>(
  options: QueryCollectionOptions<TInput, TResult, TKey>
): QueryCollection<TInput, TResult, TKey> {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    throw new Error(
      '[Askr] createQueryCollection() must be called during component render execution.'
    );
  }

  const hookIndex = claimHookIndex(instance, 'createQueryCollection');
  const generation: object = instance;
  const runtimeState = resolveDataRuntimeState(options.runtime, true);
  const store = getCollectionStore(generation);
  let slot = store.get(hookIndex);

  if (runtimeState.retired) {
    if (slot?.runtimeState === runtimeState) {
      return slot.collection as unknown as QueryCollection<
        TInput,
        TResult,
        TKey
      >;
    }
    assertDataRuntimeActive(runtimeState);
  }

  const concurrency = normalizeQueryCollectionConcurrency(options.concurrency);
  const inputs = options.inputs();
  if (!Array.isArray(inputs)) {
    throw new Error(
      '[Askr] createQueryCollection() inputs must return a readonly array.'
    );
  }

  const previousSlot = slot;
  if (slot?.runtimeState !== runtimeState) slot = undefined;

  if (!slot) {
    const collection = new QueryCollectionCell(runtimeState);
    slot = {
      runtimeState,
      collection: collection as QueryCollectionCell<
        unknown,
        {},
        QueryCollectionKey
      >,
    };
    store.set(hookIndex, slot);
    const createdSlot = slot;
    onRenderDiscard(() => {
      collection.dispose();
      if (store.get(hookIndex) !== createdSlot) return;
      if (previousSlot) store.set(hookIndex, previousSlot);
      else store.delete(hookIndex);
    });
    if (previousSlot) {
      instance.onCommitSync(() => previousSlot.collection.dispose());
    }
    instance.onCleanup(() => {
      const current = store.get(hookIndex);
      try {
        current?.collection.dispose();
      } finally {
        store.delete(hookIndex);
        if (
          store.size === 0 &&
          collectionSlotsByGeneration.get(generation) === store
        ) {
          collectionSlotsByGeneration.delete(generation);
        }
      }
    });
  }

  const context = getActiveRenderContext() as { mode?: 'ssr' | 'spa' } | null;
  const startInitialFetches = !(
    context?.mode === 'ssr' ||
    (context?.mode === undefined && typeof window === 'undefined')
  );
  const collection = slot.collection as unknown as QueryCollectionCell<
    TInput,
    TResult,
    TKey
  >;
  const commitUpdate = collection.update(
    options.query,
    inputs,
    options.key,
    concurrency,
    startInitialFetches
  );
  instance.onCommitSync(commitUpdate);
  return collection;
}
