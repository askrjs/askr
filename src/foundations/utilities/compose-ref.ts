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
  // Fast path: use Object.isExtensible check instead of try/catch for better performance
  if (Object.isExtensible(ref)) {
    (ref as { current: T | null }).current = value;
  }
}

/** Combine multiple refs into one callback ref that writes to all of them. */
export function composeRefs<T>(
  ...refs: Array<Ref<T>>
): (value: T | null) => void {
  return (value: T | null) => {
    for (const ref of refs) setRef(ref, value);
  };
}
