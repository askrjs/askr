import { claimHookIndex, getCurrentComponentInstance } from '../runtime';
import { recordReadableRead } from '../runtime';
import {
  ensureMutationCleanup,
  getMutationSlotStore,
  invalidateQueriesForRuntime,
  resolveDataRuntimeState,
  type DataRuntimeState,
} from './data-runtime';
import {
  createReadableSource,
  isAbortError,
  isCurrentAsyncOperation,
  normalizeAsyncDataError,
  notifySource,
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
  private readonly rollbacks = new Map<AbortController, () => void>();
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
    return this.state.status;
  }

  get pending(): boolean {
    recordReadableRead(this.source);
    return this.state.status === 'pending';
  }

  get error(): {} | null {
    recordReadableRead(this.source);
    return this.state.error;
  }

  get result(): TResult | null {
    recordReadableRead(this.source);
    return this.state.result;
  }

  private setState(next: Partial<MutationRecord<TResult>>): void {
    this.state = {
      ...this.state,
      ...next,
    };
    notifySource(this.source);
  }

  async execute(input: TInput): Promise<TResult> {
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

    this.setState({ status: 'pending', error: null, result: null });

    let result: TResult;
    try {
      const rollback = optimistic?.(input, { signal: controller.signal });
      if (rollback) this.rollbacks.set(controller, rollback);
      result = await action(input, { signal: controller.signal });
      this.rollbacks.delete(controller);
    } catch (cause) {
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
      this.rollbacks.delete(controller);
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
    this.generation += 1;
    this.controller = null;
    this.setState({ status: 'idle', error: null, result: null });
    this.cancelActive();
  }

  private rollbackOptimistic(controller: AbortController): void {
    const rollback = this.rollbacks.get(controller);
    this.rollbacks.delete(controller);
    rollback?.();
  }

  private cancelActive(): void {
    const controllers = [...this.activeControllers];
    this.activeControllers.clear();
    const errors: unknown[] = [];
    for (const controller of controllers) {
      try {
        this.rollbackOptimistic(controller);
      } catch (error) {
        errors.push(error);
      }
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
  const runtimeState = resolveDataRuntimeState(options.runtime);
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
