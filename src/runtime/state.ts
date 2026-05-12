/**
 * State primitive for Askr components
 * Optimized for minimal overhead and fast updates
 *
 * INVARIANTS ENFORCED:
 * - state() only callable during component render (currentInstance exists)
 * - state() called at top-level only (indices must be monotonically increasing)
 * - state values persist across re-renders (stored in stateValues array)
 * - state.set() cannot be called during render (causes infinite loops)
 * - state.set() always enqueues through scheduler (never direct mutation)
 * - state.set() callback (notifyUpdate) always available
 */

import {
  claimHookIndex,
  getCurrentInstance,
  type ComponentInstance,
} from './component';
import { isBulkCommitActive } from './fastlane';
import {
  recordReadableRead,
  type ReadableSource,
  markReadableDerivedSubscribersDirty,
  markReactivePropsDirtySource,
  notifyReadableReaders,
} from './readable';

/**
 * State value holder - callable to read, has set method to update
 * @example
 * const count = state(0);
 * count();           // read: 0
 * count.set(1);      // write: triggers re-render
 */
export interface State<T> extends ReadableSource<T> {
  (): T;
  set(value: T): void;
  set(updater: (prev: T) => T): void;
  [Symbol.iterator](): Iterator<State<T> | State<T>['set']>; // Allows destructuring: const [get, set] = state(0)
}

/**
 * Creates a local state value for a component
 * Optimized for:
 * - O(1) read performance
 * - Minimal allocation per state
 * - Fast scheduler integration
 *
 * IMPORTANT: state() must be called during component render execution.
 * It captures the current component instance from context.
 * Calling outside a component function will throw an error.
 *
 * @example
 * ```ts
 * // ✅ Correct: called during render
 * export function Counter() {
 *   const count = state(0);
 *   return { type: 'button', children: [count()] };
 * }
 *
 * // ❌ Wrong: called outside component
 * const count = state(0);
 * export function BadComponent() {
 *   return { type: 'div' };
 * }
 * ```
 */
export function state<T>(initialValue: T): State<T> {
  // INVARIANT: state() must be called during component render
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(
      'state() can only be called during component render execution. ' +
        'Move state() calls to the top level of your component function.'
    );
  }

  const index = claimHookIndex(instance, 'state');
  const stateValues = instance.stateValues;

  // INVARIANT: Reuse existing state if it exists (fast path on re-renders)
  // This ensures state identity and persistence and enforces ownership stability
  if (stateValues[index]) {
    const existing = stateValues[index] as State<T> & {
      _owner?: ComponentInstance;
    };
    // Ownership must be stable: the state cell belongs to the instance that
    // created it and must never change. This checks for accidental reuse.
    if (existing._owner !== instance) {
      throw new Error(
        `State ownership violation: state() called at index ${index} is owned by a different component instance. ` +
          `State ownership is positional and immutable.`
      );
    }
    return existing as State<T>;
  }

  // Create new state (slow path, only on first render) — delegated to helper
  const cell = createStateCell(initialValue, instance);

  // INVARIANT: Store state in instance for persistence across renders
  stateValues[index] = cell;

  return cell;
}

/**
 * Internal helper: create the backing state cell (value + readers + set semantics)
 * This extraction makes it easier to later split hook wiring from storage.
 */
function createStateCell<T>(
  initialValue: T,
  instance: ComponentInstance
): State<T> {
  let value = initialValue;

  // Per-state reader map: component -> last-committed render token
  const readers = new Map<ComponentInstance, number>();

  // Use a function as the state object (callable directly)
  function read(): T {
    (read as State<T>)._hasBeenRead = true;
    recordReadableRead(read as State<T>);

    return value;
  }

  // Attach the readers map to the callable so other runtime parts can access it
  (read as State<T>)._readers = readers;

  // Record explicit ownership of this state cell. Ownership is the component
  // instance that created the state cell and must never change for the life
  // of the cell. We expose this for runtime invariant checks/tests.
  (read as State<T> & { _owner?: ComponentInstance })._owner = instance;

  // Attach set method directly to function
  read.set = (newValueOrUpdater: T | ((prev: T) => T)): void => {
    // INVARIANT: State cannot be mutated during component render
    // (when currentInstance is non-null). It must be scheduled for consistency.
    const currentInst = getCurrentInstance();
    if (currentInst !== null) {
      throw new Error(
        `[Askr] state.set() cannot be called during component render. ` +
          `State mutations during render break the actor model and cause infinite loops. ` +
          `Move state updates to event handlers or use conditional rendering instead.`
      );
    }

    // Compute new value if an updater was provided
    let newValue: T;
    if (typeof newValueOrUpdater === 'function') {
      // Note: function-valued state cannot be set directly via a function argument;
      // such an argument is treated as a functional updater (this follows the common
      // convention from other libraries). If you need to store a function as state,
      // wrap it in an object.
      const updater = newValueOrUpdater as (prev: T) => T;
      newValue = updater(value);
    } else {
      newValue = newValueOrUpdater as T;
    }

    // Skip work if value didn't change
    if (Object.is(value, newValue)) return;

    // If a bulk commit is active, update backing value only and DO NOT notify or enqueue.
    // Bulk commits must be side-effect silent with respect to runtime notifications.
    if (isBulkCommitActive()) {
      // In bulk commit mode we must be side-effect free: update backing
      // value only and do not notify, enqueue, or log.
      value = newValue;
      return;
    }

    // INVARIANT: Update the value
    value = newValue;

    markReadableDerivedSubscribersDirty(read as State<T>);
    markReactivePropsDirtySource(read as State<T>);

    // notifyUpdate may be temporarily unavailable (e.g. during hydration).
    // We intentionally avoid logging here to keep the state mutation path
    // side-effect free. The scheduler will process updates when the system
    // is stable.
    // After value change, notify only components that *read* this state in their last committed render.
    void notifyReadableReaders(read as State<T>);
  };

  // Allow destructuring assignment: const [get, set] = state(0);
  // The state function is iterable and yields the getter then the setter
  (
    read as unknown as {
      [Symbol.iterator]?: () => Iterator<State<T> | State<T>['set']>;
    }
  )[Symbol.iterator] = function* (): Generator<
    State<T> | State<T>['set'],
    void,
    unknown
  > {
    yield read;
    yield read.set;
  };

  return read as State<T>;
}
