import type { Mutation } from '../data';
import { recordReadableRead } from '../runtime';
import {
  createReadableSource,
  normalizeAsyncDataError,
  notifySource,
} from '../data/shared';

/** Initial state for {@link mutationState}; exactly one of `pending`/`error`/`result` may be set. */
export type MutationFixtureInitial<TResult> = {
  pending?: boolean;
  error?: {} | null;
  result?: TResult;
};

/** A {@link Mutation} whose state is driven manually via `setPending`/`succeed`/`fail`. */
export type MutationFixture<TInput, TResult> = Mutation<TInput, TResult> & {
  /** Inputs received by the fixture's execute method. */
  readonly inputs: readonly TInput[];
  /** Move the fixture to pending without starting application work. */
  setPending(): void;
  /** Resolve the current fixture execution and expose its result. */
  succeed(result: TResult): void;
  /** Reject the current fixture execution and expose its error. */
  fail(error: {}): void;
};

type MutableMutationState<TResult> = {
  status: 'idle' | 'pending' | 'success' | 'error';
  error: {} | null;
  result: TResult | null;
};

type PendingMutation<TResult> = {
  resolve(result: TResult): void;
  reject(error: unknown): void;
};

class MutableMutationFixture<TInput, TResult> {
  private readonly source = createReadableSource();
  private readonly receivedInputs: TInput[] = [];
  private active: PendingMutation<TResult> | null = null;
  private state: MutableMutationState<TResult>;

  constructor(initial: MutationFixtureInitial<TResult> = {}) {
    const hasResult = Object.prototype.hasOwnProperty.call(initial, 'result');
    if (initial.pending && (initial.error != null || hasResult)) {
      throw new TypeError(
        '@askrjs/askr/testing mutation fixtures cannot be pending and settled.'
      );
    }
    if (initial.error != null && hasResult) {
      throw new TypeError(
        '@askrjs/askr/testing mutation fixtures cannot have both error and result.'
      );
    }
    this.state = initial.pending
      ? { status: 'pending', error: null, result: null }
      : initial.error != null
        ? { status: 'error', error: initial.error, result: null }
        : hasResult
          ? {
              status: 'success',
              error: null,
              result: initial.result as TResult,
            }
          : { status: 'idle', error: null, result: null };
  }

  get status(): MutableMutationState<TResult>['status'] {
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

  get inputs(): readonly TInput[] {
    return this.receivedInputs;
  }

  execute(input: TInput): Promise<TResult> {
    this.abort();
    this.receivedInputs.push(input);
    this.setPending();
    return new Promise<TResult>((resolve, reject) => {
      this.active = { resolve, reject };
    });
  }

  setPending(): void {
    this.setState({ status: 'pending', error: null, result: null });
  }

  succeed(result: TResult): void {
    const active = this.active;
    this.active = null;
    this.setState({ status: 'success', error: null, result });
    active?.resolve(result);
  }

  fail(error: {}): void {
    const normalized = normalizeAsyncDataError(
      error,
      'Unknown mutation fixture error'
    );
    const active = this.active;
    this.active = null;
    this.setState({ status: 'error', error: normalized, result: null });
    active?.reject(normalized);
  }

  abort(): void {
    const active = this.active;
    this.active = null;
    this.setState({ status: 'idle', error: null, result: null });
    if (active) {
      const error = new Error('Mutation fixture aborted.');
      error.name = 'AbortError';
      active.reject(error);
    }
  }

  reset(): void {
    this.abort();
  }

  private setState(state: MutableMutationState<TResult>): void {
    this.state = state;
    notifySource(this.source);
  }
}

function createMutationFixture<TInput = unknown, TResult = unknown>(
  initial: MutationFixtureInitial<TResult> = {}
): MutationFixture<TInput, TResult> {
  return new MutableMutationFixture<TInput, TResult>(
    initial
  ) as unknown as MutationFixture<TInput, TResult>;
}

/**
 * Build a {@link MutationFixture} for tests: call directly with initial
 * state, or use `.idle()`/`.pending()`/`.success(result)`/`.error(error)`.
 */
export const mutationState = Object.assign(createMutationFixture, {
  idle<TInput = unknown, TResult = unknown>(): MutationFixture<
    TInput,
    TResult
  > {
    return createMutationFixture();
  },
  pending<TInput = unknown, TResult = unknown>(): MutationFixture<
    TInput,
    TResult
  > {
    return createMutationFixture({ pending: true });
  },
  success<TInput = unknown, TResult = unknown>(
    result: TResult
  ): MutationFixture<TInput, TResult> {
    return createMutationFixture({ result });
  },
  error<TInput = unknown, TResult = unknown>(error: {}): MutationFixture<
    TInput,
    TResult
  > {
    return createMutationFixture({ error });
  },
});
