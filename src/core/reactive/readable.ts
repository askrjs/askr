/**
 * Readables: callables that read a reactive value (`state()` cells and
 * `derive()` results). A function prop or child that returns a readable
 * renders the readable's value.
 */

const READABLE = Symbol.for('askr.readable');

export function markReadable<T extends object>(fn: T): T {
  Object.defineProperty(fn, READABLE, { value: true });
  return fn;
}

export function isReadable(value: unknown): value is () => unknown {
  return (
    typeof value === 'function' &&
    (value as unknown as Record<symbol, unknown>)[READABLE] === true
  );
}

/** Call `fn`; if it returns a readable, read that too. */
export function readValue(fn: () => unknown): unknown {
  const value = fn();
  return isReadable(value) ? value() : value;
}
