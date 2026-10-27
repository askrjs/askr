import {
  claimHookIndex,
  currentComponent as getCurrentComponentInstance,
  readSource as recordReadableRead,
} from '../core/api/hooks';
import {
  assertDataRuntimeActive,
  registerDataRuntimeOwner,
  ensureMutationCleanup,
  getMutationSlotStore,
  invalidateQueriesForRuntime,
  resolveDataRuntimeState,
  type DataRuntimeState,
} from './data-runtime';
import { reportUncaughtErrorLater } from '../common/report-error';
import {
  createReadableSource,
  isAbortError,
  isCurrentAsyncOperation,
  normalizeAsyncDataError,
  notifySource,
  raceAbort,
} from './shared';
import type { Mutation, MutationOptions, MutationRecord } from './types';

export class MutationCell<TInput, TResult> {
  private readonly source = createReadableSource();
  private readonly runtimeState: DataRuntimeState;
  private action: MutationOptions<TInput, TResult>['action'];
  private optimistic?: MutationOptions<TInput, TResult>['optimistic'];
  private affects?: MutationOptions<TInput, TResult>['affects'];
  private afterSuccess?: MutationOptions<TInput, TResult>['afterSuccess'];
  private controller: AbortController | null = null;
  private readonly activeControllers = new Set<AbortController>();
  private readonly optimisticTransactions: Array<{
    controller: AbortController;
    rollback?: () => void;
    outcome: 'pending' | 'failed';
    ready: boolean;
  }> = [];
  private generation = 0;

  private state: MutationRecord<TResult> = {
    status: 'idle',
    error: null,
    result: null,
  };

  constructor(
    options: MutationOptions<TInput, TResult>,
    runtimeState: DataRuntimeState
  ) {
    this.runtimeState = runtimeState;
    registerDataRuntimeOwner(runtimeState, this);
    this.action = options.action;
    this.optimistic = options.optimistic;
    this.affects = options.affects;
    this.afterSuccess = options.afterSuccess;
  }

  setOptions(options: MutationOptions<TInput, TResult>): void {
    this.action = options.action;
    this.optimistic = options.optimistic;
    this.affects = options.affects;
    this.afterSuccess = options.afterSuccess;
  }

  get status(): 'idle' | 'pending' | 'success' | 'error' {
    recordReadableRead(this.source);
    return this.runtimeState.retired ? 'idle' : this.state.status;
  }

  get pending(): boolean {
    recordReadableRead(this.source);
    return !this.runtimeState.retired && this.state.status === 'pending';
  }

  get error(): {} | null {
    recordReadableRead(this.source);
    return this.runtimeState.retired ? null : this.state.error;
  }

  get result(): TResult | null {
    recordReadableRead(this.source);
    return this.runtimeState.retired ? null : this.state.result;
  }

  private setState(next: Partial<MutationRecord<TResult>>): void {
    this.state = {
      ...this.state,
      ...next,
    };
    notifySource(this.source);
  }

  async execute(input: TInput): Promise<TResult> {
    assertDataRuntimeActive(this.runtimeState);
    // A render may replace these callbacks while this execution is pending.
    // The operation must retain the definition it started with.
    const action = this.action;
    const optimistic = this.optimistic;
    const affects = this.affects;
    const afterSuccess = this.afterSuccess;
    this.generation += 1;
    const generation = this.generation;

    const controller = new AbortController();
    this.controller = controller;
    this.activeControllers.add(controller);
    const transaction: {
      controller: AbortController;
      rollback?: () => void;
      outcome: 'pending' | 'failed';
      ready: boolean;
    } = { controller, outcome: 'pending', ready: !optimistic };
    this.optimisticTransactions.push(transaction);

    this.setState({ status: 'pending', error: null, result: null });

    let actionPromise: Promise<TResult> | null = null;
    let result: TResult;
    try {
      if (optimistic) {
        let rollback: void | (() => void);
        try {
          rollback = optimistic(input, {
            signal: controller.signal,
          });
        } catch (error) {
          transaction.ready = true;
          throw error;
        }
        if (typeof rollback === 'function') {
          transaction.rollback = rollback;
        }
        transaction.ready = true;
        const failures = this.drainFailedOptimisticTransactions();
        if (failures.length === 1) throw failures[0];
        if (failures.length > 1) {
          throw new AggregateError(
            failures,
            'Optimistic mutation rollback failed'
          );
        }
      }
      assertDataRuntimeActive(this.runtimeState);
      controller.signal.throwIfAborted();
      actionPromise = Promise.resolve(
        action(input, { signal: controller.signal })
      );
      const actionResult = raceAbort(actionPromise, [controller.signal], true);
      result = await raceAbort(actionResult, [
        this.runtimeState.retirement.signal,
      ]);
      assertDataRuntimeActive(this.runtimeState);
      controller.signal.throwIfAborted();
      this.commitOptimistic(controller);
    } catch (cause) {
      if (
        controller.signal.aborted &&
        actionPromise &&
        afterSuccess === 'invalidate'
      ) {
        // Cancellation settles execute() promptly, but an action that ignores
        // its signal may still commit remotely. Keep invalidation attached to
        // that late success so cached reads cannot miss the committed write.
        void actionPromise.then(
          (lateResult) => {
            if (this.runtimeState.retired) return;
            try {
              const prefixes = affects?.(input, lateResult) ?? [];
              for (const prefix of new Set(prefixes)) {
                invalidateQueriesForRuntime(this.runtimeState, prefix, true);
              }
            } catch (error) {
              reportUncaughtErrorLater(error);
            }
          },
          () => undefined
        );
      }
      let error = cause;
      try {
        this.rollbackOptimistic(controller);
      } catch (rollbackError) {
        error = new AggregateError(
          [cause, rollbackError],
          'Mutation failed and its optimistic rollback failed'
        );
      }
      if (
        !isCurrentAsyncOperation(
          this.generation,
          generation,
          this.controller,
          controller
        )
      ) {
        throw error;
      }

      if (isAbortError(error, controller.signal)) {
        this.setState({ status: 'idle', error: null });
        throw error;
      }

      this.setState({
        status: 'error',
        error: normalizeAsyncDataError(error, 'Unknown mutation error'),
      });
      throw error;
    } finally {
      this.activeControllers.delete(controller);
    }

    const isCurrent = isCurrentAsyncOperation(
      this.generation,
      generation,
      this.controller,
      controller
    );
    if (isCurrent) {
      // Commit visible mutation state before marking affected queries so the
      // pending-write frame remains observable to subscribers.
      this.setState({ status: 'success', error: null, result });
    }

    assertDataRuntimeActive(this.runtimeState);

    // Every successful write may have committed remotely, including an older
    // execution whose result no longer owns the visible mutation state.
    if (afterSuccess === 'invalidate') {
      const prefixes = affects?.(input, result) ?? [];
      for (const prefix of new Set(prefixes)) {
        invalidateQueriesForRuntime(this.runtimeState, prefix, true);
      }
    }

    return result;
  }

  abort(): void {
    if (this.runtimeState.retired) return;
    if (this.activeControllers.size === 0) {
      return;
    }

    this.generation += 1;
    this.controller = null;
    if (this.state.status === 'pending') {
      this.setState({ status: 'idle', error: null, result: null });
    }
    this.cancelActive();
  }

  reset(): void {
    if (this.runtimeState.retired) return;
    this.generation += 1;
    this.controller = null;
    this.setState({ status: 'idle', error: null, result: null });
    this.cancelActive();
  }

  private rollbackOptimistic(controller: AbortController): void {
    const transaction = this.optimisticTransactions.find(
      (candidate) => candidate.controller === controller
    );
    if (!transaction) return;
    transaction.outcome = 'failed';
    const errors = this.drainFailedOptimisticTransactions();
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Optimistic mutation rollback failed');
    }
  }

  /** A successful write supersedes earlier optimistic snapshots. */
  private commitOptimistic(controller: AbortController): void {
    const index = this.optimisticTransactions.findIndex(
      (candidate) => candidate.controller === controller
    );
    if (index !== -1) this.optimisticTransactions.splice(0, index + 1);
  }

  /** Unwind failed optimistic writes in reverse order once newer work settles. */
  private drainFailedOptimisticTransactions(): unknown[] {
    const errors: unknown[] = [];
    while (true) {
      const last =
        this.optimisticTransactions[this.optimisticTransactions.length - 1];
      if (last?.outcome !== 'failed' || !last.ready) break;
      const transaction = this.optimisticTransactions.pop()!;
      try {
        transaction.rollback?.();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  /** @internal Retirement differs from ordinary abort: late writes are inert. */
  retire(): void {
    this.generation += 1;
    this.controller = null;
    this.state = { status: 'idle', error: null, result: null };
    try {
      this.cancelActive();
    } finally {
      notifySource(this.source);
    }
  }

  private cancelActive(): void {
    const controllers = [...this.activeControllers];
    this.activeControllers.clear();
    const canceled = new Set(controllers);
    for (const transaction of this.optimisticTransactions) {
      if (canceled.has(transaction.controller)) transaction.outcome = 'failed';
    }
    const errors: unknown[] = [];
    errors.push(...this.drainFailedOptimisticTransactions());
    for (const controller of controllers) {
      controller.abort();
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Optimistic mutation rollback failed');
    }
  }
}

/**
 * Create a reactive {@link Mutation} cell bound to the current component,
 * running `options.action` on `execute()` and optionally invalidating
 * affected query prefixes on success.
 */
export function createMutation<TInput, TResult>(
  options: MutationOptions<TInput, TResult>
): Mutation<TInput, TResult> {
  if (options.key !== undefined && options.key.length === 0) {
    throw new TypeError('createMutation key must be a non-empty string.');
  }

  const instance = getCurrentComponentInstance();
  const runtimeState = resolveDataRuntimeState(options.runtime, true);
  if (runtimeState.retired) {
    if (instance) {
      const hookIndex = claimHookIndex(instance, 'createMutation');
      const slot = getMutationSlotStore(runtimeState, instance).get(hookIndex);
      if (slot && slot.key === options.key)
        return slot.cell as unknown as Mutation<TInput, TResult>;
    }
    assertDataRuntimeActive(runtimeState);
  }
  const override = options.key
    ? (runtimeState.mutationTestOverrides.get(options.key) as
        | Mutation<TInput, TResult>
        | undefined)
    : undefined;

  if (!instance) {
    if (override) return override;
    return new MutationCell(options, runtimeState) as unknown as Mutation<
      TInput,
      TResult
    >;
  }

  const hookIndex = claimHookIndex(instance, 'createMutation');
  ensureMutationCleanup(runtimeState, instance);

  const slotStore = getMutationSlotStore(runtimeState, instance);
  if (override) {
    const existingSlot = slotStore.get(hookIndex);
    if (existingSlot) {
      existingSlot.cell.abort();
      slotStore.delete(hookIndex);
    }
    return override;
  }

  const existingSlot = slotStore.get(hookIndex);
  if (existingSlot && existingSlot.key === options.key) {
    const existing = existingSlot.cell as MutationCell<TInput, TResult>;
    existing.setOptions(options);
    return existing as unknown as Mutation<TInput, TResult>;
  }
  if (existingSlot) {
    existingSlot.cell.abort();
  }

  const created = new MutationCell(options, runtimeState);
  slotStore.set(hookIndex, {
    key: options.key,
    cell: created as MutationCell<unknown, unknown>,
  });
  return created as unknown as Mutation<TInput, TResult>;
}
