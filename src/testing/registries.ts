import type { Mutation, Query, DataRuntime } from '../data';
import { createDataRuntime } from '../data';
import { resolveDataRuntimeState } from '../data/data-runtime';

/** Keyed query fixture registry returned by {@link createQueryTestRegistry}. */
export interface QueryTestRegistry {
  readonly runtime: DataRuntime;
  set<T extends {}>(key: string, query: Query<T>): void;
  delete(key: string): void;
  clear(): void;
}

/** Create a keyed query fixture registry for a test render runtime. */
export function createQueryTestRegistry(
  runtime: DataRuntime = createDataRuntime()
): QueryTestRegistry {
  const overrides = resolveDataRuntimeState(runtime).queryTestOverrides;
  return {
    runtime,
    set<T extends {}>(key: string, query: Query<T>) {
      if (typeof key !== 'string' || key.length === 0) {
        throw new TypeError(
          '@askrjs/askr/testing query registry keys must be non-empty strings.'
        );
      }
      overrides.set(key, query);
    },
    delete(key: string) {
      overrides.delete(key);
    },
    clear() {
      overrides.clear();
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
export function createMutationTestRegistry(
  runtime: DataRuntime = createDataRuntime()
): MutationTestRegistry {
  const overrides = resolveDataRuntimeState(runtime).mutationTestOverrides;
  return {
    runtime,
    set<TInput, TResult>(key: string, mutation: Mutation<TInput, TResult>) {
      if (typeof key !== 'string' || key.length === 0) {
        throw new TypeError(
          '@askrjs/askr/testing mutation registry keys must be non-empty strings.'
        );
      }
      const previous = overrides.get(key) as
        | Mutation<unknown, unknown>
        | undefined;
      if (previous && previous !== mutation) previous.reset();
      overrides.set(key, mutation);
    },
    delete(key: string) {
      (overrides.get(key) as Mutation<unknown, unknown> | undefined)?.reset();
      overrides.delete(key);
    },
    clear() {
      for (const mutation of overrides.values()) {
        (mutation as Mutation<unknown, unknown>).reset();
      }
      overrides.clear();
    },
  };
}
