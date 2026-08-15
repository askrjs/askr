/**
 * Creates a stable holder for an intrinsic element ref.
 *
 * The renderer mutates `current` during commit and clears it during cleanup.
 * Updating the holder never schedules a render.
 */
export interface Ref<T extends Element = Element> {
  current: T | null;
}

/** Create a new, empty {@link Ref} holder. */
export function createRef<T extends Element = Element>(): Ref<T> {
  return { current: null };
}
