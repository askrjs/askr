import type { Mutation, Query, DataRuntime } from '../data';
import { createDataRuntime } from '../data';

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
