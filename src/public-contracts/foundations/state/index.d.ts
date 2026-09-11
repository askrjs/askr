import { State } from '../../core.js';
/** Whether `value` represents controlled mode (not `undefined`). */
declare function isControlled<T>(value: T | undefined): value is T;
/** Resolve the effective value and controlled-ness for a controllable prop. */
declare function resolveControllable<T>(
  value: T | undefined,
  defaultValue: T
): {
  value: T;
  isControlled: boolean;
};
/**
 * Build a `set` function that calls `onChange` in controlled mode, or
 * updates internal state and then calls `onChange` in uncontrolled mode.
 */
declare function makeControllable<T>(options: {
  value: T | undefined;
  defaultValue: T;
  onChange?: (next: T) => void;
  setInternal?: (next: T) => void;
}): {
  set: (next: T) => void;
  isControlled: boolean;
};
/** A {@link State} accessor that also reports whether it is controlled. */
type ControllableState<T> = State<T> & {
  isControlled: boolean;
};
/**
 * controllableState
 *
 * Hook-like primitive that mirrors `state()` semantics while supporting
 * controlled/uncontrolled behavior.
 */
declare function controllableState<T>(options: {
  value: T | undefined;
  defaultValue: T;
  onChange?: (next: T) => void;
}): ControllableState<T>;
export {
  type ControllableState,
  controllableState,
  isControlled,
  makeControllable,
  resolveControllable,
};
