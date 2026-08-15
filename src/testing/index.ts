import type { Mutation, Query, QueryStaleReason, DataRuntime } from '../data';
import type {
  ParsedSegment,
  RouteRegistry,
  RouteMatch,
  RouteRecord,
} from '../common/router';
import {
  type InvalidationEvent,
  addInvalidationListener,
} from '../data/testing';
import { computeRouteActivityMatches } from '../router/testing';
import { createDataRuntime } from '../data';
import { recordReadableRead } from '../runtime';
import {
  createReadableSource,
  normalizeAsyncDataError,
  notifySource,
} from '../data/shared';

import { dispatch as dispatchEvent } from './render';

export { cleanup, dispatch, flush, mount, render, renderRoute } from './render';
export type { RenderOptions, RenderResult, RouteRenderOptions } from './render';

/** Dispatch the browser click sequence expected by Askr's delegated events. */
export function click(element: Element): boolean {
  if (!element || typeof element.dispatchEvent !== 'function') {
    throw new TypeError('@askrjs/askr/testing click requires an Element.');
  }
  return dispatchEvent(element, 'click');
}

/** Set a text control's value and emit an input event for each character. */
export function type(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string
): void {
  if (!element || typeof element.dispatchEvent !== 'function') {
    throw new TypeError('@askrjs/askr/testing type requires a text control.');
  }
  for (const character of text) {
    element.value += character;
    dispatchEvent(element, 'input', {
      inputType: 'insertText',
      data: character,
    });
  }
}

/** Dispatch a cancelable bubbling submit event on a form. */
export function submit(form: HTMLFormElement): boolean {
  if (!form || typeof form.dispatchEvent !== 'function') {
    throw new TypeError('@askrjs/askr/testing submit requires a form.');
  }
  return dispatchEvent(form, 'submit');
}

/** Keyed query fixture registry returned by {@link createQueryTestRegistry}. */
export interface QueryTestRegistry {
  readonly runtime: DataRuntime;
  set<T extends {}>(key: string, query: Query<T>): void;
  delete(key: string): void;
  clear(): void;
}

/** Create a keyed query fixture registry for a test render runtime. */
export function createQueryTestRegistry(): QueryTestRegistry {
  const runtime = createDataRuntime();
  return {
    runtime,
    set<T extends {}>(key: string, query: Query<T>) {
      if (typeof key !== 'string' || key.length === 0) {
        throw new TypeError(
          '@askrjs/askr/testing query registry keys must be non-empty strings.'
        );
      }
      runtime.queryTestOverrides.set(key, query);
    },
    delete(key: string) {
      runtime.queryTestOverrides.delete(key);
    },
    clear() {
      runtime.queryTestOverrides.clear();
    },
  };
}

/** Keyed mutation fixture registry returned by {@link createMutationTestRegistry}. */
export interface MutationTestRegistry {
  readonly runtime: DataRuntime;
  set<TInput, TResult>(key: string, mutation: Mutation<TInput, TResult>): void;
  delete(key: string): void;
  clear(): void;
}

/** Create a keyed mutation fixture registry for a test render runtime. */
export function createMutationTestRegistry(): MutationTestRegistry {
  const runtime = createDataRuntime();
  return {
    runtime,
    set<TInput, TResult>(key: string, mutation: Mutation<TInput, TResult>) {
      if (typeof key !== 'string' || key.length === 0) {
        throw new TypeError(
          '@askrjs/askr/testing mutation registry keys must be non-empty strings.'
        );
      }
      const previous = runtime.mutationTestOverrides.get(key) as
        | Mutation<unknown, unknown>
        | undefined;
      if (previous && previous !== mutation) previous.reset();
      runtime.mutationTestOverrides.set(key, mutation);
    },
    delete(key: string) {
      (
        runtime.mutationTestOverrides.get(key) as
          | Mutation<unknown, unknown>
          | undefined
      )?.reset();
      runtime.mutationTestOverrides.delete(key);
    },
    clear() {
      for (const mutation of runtime.mutationTestOverrides.values()) {
        (mutation as Mutation<unknown, unknown>).reset();
      }
      runtime.mutationTestOverrides.clear();
    },
  };
}

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

/** Refresh callback for a {@link mockQuery} fixture, invoked by the query's `refresh()`. */
export type MockRefresh = () => void | Promise<void>;

/** Options for {@link mockQuery} fixtures. */
export interface MockQueryOptions {
  refresh?: MockRefresh;
}

/** A single recorded call to {@link invalidate}, captured by {@link createInvalidationRecorder}. */
export interface InvalidationRecord {
  prefix: string;
  markPendingWrite: boolean;
}

/** Recorder returned by {@link createInvalidationRecorder}. */
export interface InvalidationRecorder {
  readonly calls: readonly InvalidationRecord[];
  readonly prefixes: readonly string[];
  clear(): void;
  stop(): void;
}

interface MatchRouteOptions {
  registry: RouteRegistry;
}

/** A splat-route/static-route path collision reported by {@link getRouteWarnings}. */
export interface RoutePatternWarning {
  kind: 'route-collision';
  path: string;
  conflictingPath: string;
  segment: string;
  namespace: string | undefined;
  message: string;
}

type StaleValueReason = Exclude<QueryStaleReason, 'error'>;

function normalizeRefresh(options?: MockQueryOptions): () => Promise<void> {
  return async () => {
    await options?.refresh?.();
  };
}

function makeQuery<T extends {}>(
  state: Omit<Query<T>, 'refresh'>,
  options?: MockQueryOptions
): Query<T> {
  return {
    ...state,
    refresh: normalizeRefresh(options),
  } as Query<T>;
}

function createFreshQuery<T extends {}>(
  data: T,
  options?: MockQueryOptions
): Query<T> {
  return makeQuery(
    {
      data,
      error: null,
      loading: false,
      refreshing: false,
      stale: false,
      consistency: 'fresh',
      staleReason: null,
    },
    options
  );
}

/**
 * Build a fresh {@link Query} fixture for tests: call directly with data, or
 * use `.loading()`/`.error()`/`.refreshing()`/`.stale()`/`.pendingWrite()`.
 */
export const mockQuery = Object.assign(createFreshQuery, {
  loading<T extends {} = {}>(options?: MockQueryOptions): Query<T> {
    return makeQuery<T>(
      {
        data: null,
        error: null,
        loading: true,
        refreshing: false,
        stale: false,
        consistency: 'fresh',
        staleReason: null,
      },
      options
    );
  },

  error<T extends {} = {}>(
    error: {},
    previousData?: T,
    options?: MockQueryOptions
  ): Query<T> {
    return makeQuery(
      {
        data: previousData ?? null,
        error,
        loading: false,
        refreshing: false,
        stale: true,
        consistency: 'stale',
        staleReason: 'error',
      } as Omit<Query<T>, 'refresh'>,
      options
    );
  },

  refreshing<T extends {}>(data: T, options?: MockQueryOptions): Query<T> {
    return makeQuery(
      {
        data,
        error: null,
        loading: false,
        refreshing: true,
        stale: true,
        consistency: 'refreshing',
        staleReason: null,
      },
      options
    );
  },

  stale<T extends {}>(
    data: T,
    reason: StaleValueReason = 'inconsistent',
    options?: MockQueryOptions
  ): Query<T> {
    return makeQuery(
      {
        data,
        error: null,
        loading: false,
        refreshing: false,
        stale: true,
        consistency: 'stale',
        staleReason: reason,
      },
      options
    );
  },

  pendingWrite<T extends {}>(data: T, options?: MockQueryOptions): Query<T> {
    return makeQuery(
      {
        data,
        error: null,
        loading: false,
        refreshing: true,
        stale: true,
        consistency: 'pending-write',
        staleReason: null,
      },
      options
    );
  },
});

/** Alias table mirroring {@link mockQuery}'s state builders (`fresh`, `loading`, `error`, ...). */
export const queryState = {
  fresh: createFreshQuery,
  loading: mockQuery.loading,
  error: mockQuery.error,
  refreshing: mockQuery.refreshing,
  stale: mockQuery.stale,
  pendingWrite: mockQuery.pendingWrite,
};

/** Start recording {@link invalidate} calls for assertions; call `stop()` when done. */
export function createInvalidationRecorder(): InvalidationRecorder {
  const records: InvalidationRecord[] = [];
  let active = true;

  const unsubscribe = addInvalidationListener((event: InvalidationEvent) => {
    records.push({
      prefix: event.prefix,
      markPendingWrite: event.markPendingWrite,
    });
  });

  return {
    get calls() {
      return records.slice();
    },

    get prefixes() {
      return records.map((record) => record.prefix);
    },

    clear() {
      records.length = 0;
    },

    stop() {
      if (!active) {
        return;
      }

      active = false;
      unsubscribe();
    },
  };
}

/** Match `path` against a route registry for tests, without mounting the app. */
export function matchRoute(
  path: string,
  options: MatchRouteOptions
): RouteMatch | null {
  if (!options?.registry) {
    throw new TypeError('matchRoute requires options.registry.');
  }

  return (
    computeRouteActivityMatches(path, {
      registry: options.registry,
    })[0] ?? null
  );
}

type RoutePatternRecord = {
  path: string;
  segments: ParsedSegment[];
  namespace: string | undefined;
};

function getRoutePatternRecords(
  options: MatchRouteOptions
): RoutePatternRecord[] {
  if (!options?.registry) {
    throw new TypeError('getRouteWarnings requires options.registry.');
  }

  return options.registry.manifest.records.map((record: RouteRecord) => ({
    path: record.path,
    segments: record.segments,
    namespace: record.options.namespace,
  }));
}

function routePrefixMatches(
  splatPrefix: readonly ParsedSegment[],
  routeSegments: readonly ParsedSegment[]
): boolean {
  if (routeSegments.length <= splatPrefix.length) {
    return false;
  }

  for (let index = 0; index < splatPrefix.length; index++) {
    const splatSegment = splatPrefix[index];
    const routeSegment = routeSegments[index];

    if (
      splatSegment.kind === 'static' &&
      routeSegment.kind === 'static' &&
      splatSegment.value !== routeSegment.value
    ) {
      return false;
    }
  }

  return true;
}

/** Find named-splat routes whose reserved segments collide with sibling static routes. */
export function getRouteWarnings(
  options: MatchRouteOptions
): RoutePatternWarning[] {
  const records = getRoutePatternRecords(options);
  const warnings: RoutePatternWarning[] = [];

  for (const record of records) {
    const splatIndex = record.segments.findIndex(
      (segment) => segment.kind === 'splat'
    );
    if (splatIndex === -1) {
      continue;
    }

    const splatPrefix = record.segments.slice(0, splatIndex);
    for (const candidate of records) {
      if (
        candidate === record ||
        candidate.namespace !== record.namespace ||
        !routePrefixMatches(splatPrefix, candidate.segments)
      ) {
        continue;
      }

      const reservedSegment = candidate.segments[splatIndex];
      if (reservedSegment?.kind !== 'static') {
        continue;
      }

      warnings.push({
        kind: 'route-collision',
        path: record.path,
        conflictingPath: candidate.path,
        segment: reservedSegment.value,
        namespace: record.namespace,
        message: `Route "${candidate.path}" reserves segment "${reservedSegment.value}" under named splat route "${record.path}".`,
      });
    }
  }

  return warnings.sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    if (pathOrder !== 0) {
      return pathOrder;
    }
    return left.conflictingPath.localeCompare(right.conflictingPath);
  });
}
