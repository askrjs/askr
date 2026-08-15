/**
 * controllable
 *
 * Small utilities for controlled vs uncontrolled components. These helpers are
 * intentionally minimal and do not manage state themselves; they help component
 * implementations make correct decisions about when to call `onChange` vs
 * update internal state.
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Controlled Detection
 *    A value is "controlled" if it is not `undefined`.
 *    This matches React conventions and is SSR-safe.
 *
 * 2. onChange Timing
 *    - Controlled mode: onChange called immediately, no internal update
 *    - Uncontrolled mode: internal state updated first, then onChange called
 *    This ensures onChange sees the new value in both modes.
 *
 * 3. Value Equality
 *    controllableState uses Object.is() to prevent unnecessary onChange calls.
 *    This is intentional — strict equality, no deep comparison.
 */

import { state, type State } from '../../runtime';

/** Whether `value` represents controlled mode (not `undefined`). */
export function isControlled<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/** Resolve the effective value and controlled-ness for a controllable prop. */
export function resolveControllable<T>(
  value: T | undefined,
  defaultValue: T
): { value: T; isControlled: boolean } {
  const controlled = isControlled(value);
  return {
    value: controlled ? (value as T) : defaultValue,
    isControlled: controlled,
  };
}

/**
 * Build a `set` function that calls `onChange` in controlled mode, or
 * updates internal state and then calls `onChange` in uncontrolled mode.
 */
export function makeControllable<T>(options: {
  value: T | undefined;
  defaultValue: T;
  onChange?: (next: T) => void;
  setInternal?: (next: T) => void;
}) {
  const { value, defaultValue, onChange, setInternal } = options;
  const { isControlled } = resolveControllable(value, defaultValue);

  function set(next: T) {
    if (isControlled) {
      onChange?.(next);
    } else {
      setInternal?.(next);
      onChange?.(next);
    }
  }

  return { set, isControlled };
}

/** A {@link State} accessor that also reports whether it is controlled. */
export type ControllableState<T> = State<T> & { isControlled: boolean };

/**
 * controllableState
 *
 * Hook-like primitive that mirrors `state()` semantics while supporting
 * controlled/uncontrolled behavior.
 */
export function controllableState<T>(options: {
  value: T | undefined;
  defaultValue: T;
  onChange?: (next: T) => void;
}): ControllableState<T> {
  const isControlled = options.value !== undefined;
  const internal = state<T>(options.defaultValue);
  internal();

  function read(): T {
    if (isControlled) {
      return options.value as T;
    }

    return internal!();
  }

  read.set = (nextOrUpdater: T | ((prev: T) => T)) => {
    const prev = read();
    const next =
      typeof nextOrUpdater === 'function'
        ? (nextOrUpdater as (p: T) => T)(prev)
        : (nextOrUpdater as T);

    if (Object.is(prev, next)) return;

    if (isControlled) {
      options.onChange?.(next);
      return;
    }

    internal!.set(nextOrUpdater as never);
    options.onChange?.(next);
  };

  (read as ControllableState<T>).isControlled = isControlled;
  return read as ControllableState<T>;
}
