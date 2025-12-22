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

import { globalScheduler } from './scheduler';
import {
  getCurrentInstance,
  getNextStateIndex,
  type ComponentInstance,
} from './component';
import { invariant } from '../dev/invariant';
import { isBulkCommitActive } from './fastlane-shared';

/**
 * State value holder - callable to read, has set method to update
 * @example
 * const count = state(0);
 * count();           // read: 0
 * count.set(1);      // write: triggers re-render
 */
export interface State<T> {
  (): T;
  set(value: T): void;
  set(updater: (prev: T) => T): void;
  _hasBeenRead?: boolean; // Internal: track if state has been read during render
  _readers?: Map<ComponentInstance, number>; // Internal: map of readers -> last committed token
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

  const index = getNextStateIndex();
  const stateValues = instance.stateValues;

  // INVARIANT: Detect conditional state() calls by validating index order
  // If indices go backward, state() was called conditionally
  if (index < instance.stateIndexCheck) {
    throw new Error(
      `State index violation: state() call at index ${index}, ` +
        `but previously saw index ${instance.stateIndexCheck}. ` +
        `This happens when state() is called conditionally (inside if/for/etc). ` +
        `Move all state() calls to the top level of your component function, ` +
        `before any conditionals.`
    );
  }

  // INVARIANT: stateIndexCheck advances monotonically
  invariant(
    index >= instance.stateIndexCheck,
    '[State] State indices must increase monotonically'
  );
  instance.stateIndexCheck = index;

  // INVARIANT: On subsequent renders, validate that state calls happen in same order
  if (instance.firstRenderComplete) {
    // Check if this index was expected based on first render
    if (!instance.expectedStateIndices.includes(index)) {
      throw new Error(
        `Hook order violation: state() called at index ${index}, ` +
          `but this index was not in the first render's sequence [${instance.expectedStateIndices.join(', ')}]. ` +
          `This usually means state() is inside a conditional or loop. ` +
          `Move all state() calls to the top level of your component function.`
      );
    }
  } else {
    // First render - record this index in the expected sequence
    instance.expectedStateIndices.push(index);
  }

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

    // Record that the current instance read this state during its in-progress render
    const inst = getCurrentInstance();
    if (inst && inst._currentRenderToken !== undefined) {
      if (!inst._pendingReadStates) inst._pendingReadStates = new Set();
      inst._pendingReadStates.add(read as State<T>);
    }

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
    // NOTE: Skip invariant checks in production for graceful degradation
    const currentInst = getCurrentInstance();
    if (currentInst !== null && process.env.NODE_ENV !== 'production') {
      throw new Error(
        `[Askr] state.set() cannot be called during component render. ` +
          `State mutations during render break the actor model and cause infinite loops. ` +
          `Move state updates to event handlers or use conditional rendering instead.`
      );
    }

    // PRODUCTION FALLBACK: Skip state updates during render to prevent infinite loops
    if (currentInst !== null && process.env.NODE_ENV === 'production') {
      return;
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

    // notifyUpdate may be temporarily unavailable (e.g. during hydration).
    // We intentionally avoid logging here to keep the state mutation path
    // side-effect free. The scheduler will process updates when the system
    // is stable.

    // After value change, notify only components that *read* this state in their last committed render
    const readersMap = (read as State<T>)._readers as
      | Map<ComponentInstance, number>
      | undefined;
    if (readersMap) {
      for (const [subInst, token] of readersMap) {
        // Only notify if the component's last committed render token matches the token recorded
        // when it last read this state. This ensures we only wake components that actually
        // observed the state in their most recent render.
        if (subInst.lastRenderToken !== token) continue;
        if (!subInst.hasPendingUpdate) {
          // Log enqueue decision for subInst

          subInst.hasPendingUpdate = true;
          const subTask = subInst._pendingFlushTask;
          if (subTask) globalScheduler.enqueue(subTask);
          else
            globalScheduler.enqueue(() => {
              subInst.hasPendingUpdate = false;
              subInst.notifyUpdate?.();
            });
        }
      }
    }

    // OPTIMIZATION: Batch state updates from the same component within the same event loop tick
    // Only enqueue the owner component if it actually read this state during its last committed render
    const readersMapForOwner = readersMap;
    const ownerRecordedToken = readersMapForOwner?.get(instance);
    const ownerShouldEnqueue =
      // Normal case: owner read this state in last committed render
      ownerRecordedToken !== undefined &&
      instance.lastRenderToken === ownerRecordedToken;

    if (ownerShouldEnqueue && !instance.hasPendingUpdate) {
      instance.hasPendingUpdate = true;
      // INVARIANT: All state updates go through scheduler
      // Use prebound task to avoid allocating a closure per update
      // Fallback to a safe closure if the prebound task is not present
      const task = instance._pendingFlushTask;
      if (task) globalScheduler.enqueue(task);
      else
        globalScheduler.enqueue(() => {
          instance.hasPendingUpdate = false;
          instance.notifyUpdate?.();
        });
    }
  };

  return read as State<T>;
}
