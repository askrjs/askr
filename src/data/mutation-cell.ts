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
  normalizeAsyncDataError,
  notifySource,
} from './shared';
import type { Mutation, MutationOptions, MutationRecord } from './types';

export class MutationCell<TInput, TResult> {
  private readonly source = createReadableSource();
  private readonly runtimeState: DataRuntimeState;
  private action: MutationOptions<TInput, TResult>['action'];
  private affects?: MutationOptions<TInput, TResult>['affects'];
  private afterSuccess?: MutationOptions<TInput, TResult>['afterSuccess'];
  private controller: AbortController | null = null;
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
    const affects = this.affects;
    const afterSuccess = this.afterSuccess;
    this.generation += 1;
    const generation = this.generation;

    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    this.setState({ status: 'pending', error: null, result: null });

    let result: TResult;
    try {
      result = await action(input, { signal: controller.signal });
    } catch (error) {
      if (this.generation !== generation || this.controller !== controller) {
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
    }

    if (this.generation !== generation || this.controller !== controller) {
      return result;
    }

    this.setState({ status: 'success', error: null, result });

    if (afterSuccess === 'invalidate') {
      const prefixes = affects?.(input, result) ?? [];
      for (const prefix of new Set(prefixes)) {
        invalidateQueriesForRuntime(this.runtimeState, prefix, true);
      }
    }

    return result;
  }

  abort(): void {
    if (this.state.status !== 'pending') {
      return;
    }

    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    this.setState({ status: 'idle', error: null, result: null });
  }

  reset(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    this.setState({ status: 'idle', error: null, result: null });
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

  const hookIndex = claimHookIndex(instance, 'mutation');
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
