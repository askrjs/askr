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
): (value: T | null) => void {
  return (value: T | null) => {
    const errors: unknown[] = [];
    for (const ref of refs) {
      try {
        setRef(ref, value);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Composed ref callbacks failed');
    }
  };
}
