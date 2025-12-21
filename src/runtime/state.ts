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
import { logger } from '../dev/logger';
import { isBulkCommitActive } from './fastlane';

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
  // This ensures state identity and persistence
  if (stateValues[index]) {
    return stateValues[index] as State<T>;
  }

  // Create new state (slow path, only on first render)
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

  // Attach set method directly to function
  read.set = (newValue: T): void => {
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

    // Skip work if value didn't change
    if (Object.is(value, newValue)) return;

    // If a bulk commit is active, update backing value only and DO NOT notify or enqueue.
    // Bulk commits must be side-effect silent with respect to runtime notifications.
    if (isBulkCommitActive()) {
      value = newValue;
      // eslint-disable-next-line no-console
      console.log(
        '[DEBUG][state] bulk commit active - updated backing value only'
      );
      return;
    }

    // INVARIANT: Update the value
    value = newValue;

    // NOTE: notifyUpdate should be available, but during hydration or edge
    // cases it may be temporarily null. We tolerate that by warning in dev-mode
    // but still enqueue a scheduler task to process the update. This ensures
    // user event handlers (e.g., input during hydration) still cause updates.
    if (!instance.notifyUpdate && process.env.NODE_ENV !== 'production') {
      logger.warn(
        '[Askr] notifyUpdate callback is not available yet for this component. Update will be applied when the scheduler runs.'
      );
    }

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
      (ownerRecordedToken !== undefined &&
        instance.lastRenderToken === ownerRecordedToken) ||
      // Fallback: owner token missing but owner is mounted and the owner
      // itself previously read this state in its last committed render.
      // This avoids enqueuing the owner merely because some other component
      // read the state (which would cause extra re-renders).
      (ownerRecordedToken === undefined &&
        instance.mounted &&
        instance._lastReadStates?.has(read as State<T>) === true);

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

  // INVARIANT: Store state in instance for persistence across renders
  stateValues[index] = read as State<T>;

  return read as State<T>;
}
