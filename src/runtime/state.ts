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
import { getCurrentInstance, getNextStateIndex } from './component';
import { invariant } from '../dev/invariant';
import { logger } from '../dev/logger';

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

  // Use a function as the state object (callable directly)
  function read(): T {
    (read as State<T>)._hasBeenRead = true;
    return value;
  }

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

    // OPTIMIZATION: Batch state updates from the same component within the same event loop tick
    // Only enqueue if we don't already have a pending update
    if (!instance.hasPendingUpdate) {
      instance.hasPendingUpdate = true;
      // INVARIANT: All state updates go through scheduler
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
