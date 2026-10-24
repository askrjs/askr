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
/**
 * A callback ref, an object ref, or a nullish value (no-op). A callback may
 * return a cleanup that runs on detach instead of a call with `null`.
 */
type Ref<T> =
  | ((value: T | null) => void | (() => void))
  | {
      current: T | null;
    }
  | null
  | undefined;
/** Write `value` to a {@link Ref}, ignoring failures on readonly object refs. */
declare function setRef<T>(ref: Ref<T>, value: T | null): void;
/**
 * Combine multiple refs into one callback ref that writes to all of them.
 * Cleanups the callbacks return are forwarded: the composed ref returns one
 * cleanup that runs them and gives `null` to the refs that returned none.
 */
declare function composeRefs<T>(
  ...refs: Array<Ref<T>>
): (value: T | null) => void | (() => void);
export { composeRefs, setRef, Ref };
