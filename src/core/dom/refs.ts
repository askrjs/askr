/**
 * Refs: a callback receives the element (then null on removal); an object
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
