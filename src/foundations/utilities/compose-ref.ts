/**
 * Ref composition utilities
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Ref Types Supported
 *    - Callback refs: (value: T | null) => void
 *    - Object refs: { current: T | null }
 *    - null/undefined (no-op)
 *
 * 2. Write Failure Handling
 *    setRef catches write failures (readonly refs) and ignores them.
 *    This is intentional — refs may be readonly in some contexts.
 *
 * 3. Composition Order
 *    composeRefs applies refs in array order (left to right).
 *    All refs are called even if one fails.
 */

/** A callback ref, an object ref, or a nullish value (no-op). */
export type Ref<T> =
  | ((value: T | null) => void)
  | { current: T | null }
  | null
  | undefined;

/** Write `value` to a {@link Ref}, ignoring failures on readonly object refs. */
export function setRef<T>(ref: Ref<T>, value: T | null): void {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  try {
    (ref as { current: T | null }).current = value;
  } catch {
    // Readonly object refs are intentionally ignored so later composed refs run.
  }
}

/** Combine multiple refs into one callback ref that writes to all of them. */
export function composeRefs<T>(
  ...refs: Array<Ref<T>>
): (value: T | null) => void | (() => void) {
  return (value: T | null) => {
    const errors: unknown[] = [];
    // Cleanups the callbacks returned, and the refs that returned none
    // (callbacks and object refs) and so expect null on detach, as they
    // would when attached directly.
    const releases: Array<() => void> = [];
    const nullOnDetach: Array<Ref<T>> = [];
    for (const ref of refs) {
      try {
        if (value !== null && typeof ref === 'function') {
          const result = (ref as (value: T) => unknown)(value);
          if (typeof result === 'function') releases.push(result as () => void);
          else nullOnDetach.push(ref);
        } else {
          setRef(ref, value);
          if (value !== null && ref) nullOnDetach.push(ref);
        }
      } catch (error) {
        errors.push(error);
      }
    }
    const release = (reset: ReadonlyArray<Ref<T>>): void => {
      const failures: unknown[] = [];
      for (const cleanup of releases) {
        try {
          cleanup();
        } catch (error) {
          failures.push(error);
        }
      }
      for (const ref of reset) {
        try {
          setRef(ref, null);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Composed ref cleanups failed');
      }
    };
    if (errors.length > 0) {
      // Every ref was still applied (policy 3); the detach that follows
      // gives them null. The cleanups already returned cannot be forwarded
      // from a throwing attach, so they run now rather than never.
      if (value !== null) {
        try {
          release([]);
        } catch (failure) {
          errors.push(failure);
        }
      }
      throw new AggregateError(errors, 'Composed ref callbacks failed');
    }
    if (value === null || releases.length === 0) return undefined;
    return () => release(nullOnDetach);
  };
}
