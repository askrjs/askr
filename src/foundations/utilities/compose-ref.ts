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

export type Ref<T> =
  | ((value: T | null) => void)
  | { current: T | null }
  | null
  | undefined;

export function setRef<T>(ref: Ref<T>, value: T | null): void {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  try {
    (ref as { current: T | null }).current = value;
  } catch {
    // Ignore write failures for readonly refs
  }
}

export function composeRefs<T>(
  ...refs: Array<Ref<T>>
): (value: T | null) => void {
  return (value: T | null) => {
    for (const ref of refs) setRef(ref, value);
  };
}
