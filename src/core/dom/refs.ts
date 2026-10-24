/**
 * Refs: a callback receives the element, then either runs the cleanup it
 * returned or, when it returned none, receives null on removal. An object
 * ref's `current` is assigned. A read-only object ref is ignored.
 */

export function setRef(ref: unknown, value: Element | null): void {
  if (!ref) return;
  if (typeof ref === 'function') {
    (ref as (value: Element | null) => void)(value);
    return;
  }
  try {
    (ref as { current: Element | null }).current = value;
  } catch {
    // Readonly object refs are ignored so later composed refs still run.
  }
}

/** Cleanups returned by callback refs, per element and ref. */
const cleanups = new WeakMap<Element, Map<unknown, () => void>>();

/** Point `ref` at `el`; a callback ref may return a cleanup to run on detach. */
export function attachRefTo(ref: unknown, el: Element): void {
  if (typeof ref !== 'function') {
    setRef(ref, el);
    return;
  }
  const result = (ref as (value: Element | null) => unknown)(el);
  if (typeof result === 'function') {
    let byRef = cleanups.get(el);
    if (!byRef) cleanups.set(el, (byRef = new Map()));
    byRef.set(ref, result as () => void);
  }
}

/** Detach `ref` from `el`: its returned cleanup, or else `ref(null)`. */
export function detachRefFrom(ref: unknown, el: Element): void {
  const byRef = typeof ref === 'function' ? cleanups.get(el) : undefined;
  const cleanup = byRef?.get(ref);
  if (cleanup) {
    byRef!.delete(ref);
    if (byRef!.size === 0) cleanups.delete(el);
    cleanup();
    return;
  }
  setRef(ref, null);
}
