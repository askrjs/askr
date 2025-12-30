/**
 * controllable
 *
 * Small utilities for controlled vs uncontrolled components. These helpers are
 * intentionally minimal and do not manage state themselves; they help component
 * implementations make correct decisions about when to call `onChange` vs
 * update internal state.
 */

import { state, type State } from '../../runtime/state';

export function isControlled<T>(value: T | undefined): value is T {
  return value !== undefined;
}

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
  const internal = state<T>(options.defaultValue);
  const isControlled = options.value !== undefined;

  function read(): T {
    return isControlled ? (options.value as T) : internal();
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

    internal.set(nextOrUpdater as never);
    options.onChange?.(next);
  };

  (read as ControllableState<T>).isControlled = isControlled;
  return read as ControllableState<T>;
}
