/**
 * Component instance lifecycle management
 * Internal only — users never see this
 */

import { type State } from './state';
import { evaluate } from '../renderer/dom';
import { globalScheduler } from './scheduler';
import type { JSXElement } from '../jsx/types';
import type { Props } from '../shared/types';
import {
  // withContext is the sole primitive for context restoration
  withContext,
  type ContextFrame,
} from './context';
import { logger } from '../dev/logger';

export type ComponentFunction = (
  props: Props,
  context?: { signal: AbortSignal }
) => JSXElement | VNode | string | number | null;

type VNode = {
  type: string;
  props?: Props;
  children?: (string | VNode | null | undefined | false)[];
};

export interface ComponentInstance {
  id: string;
  fn: ComponentFunction;
  props: Props;
  target: Element | null;
  mounted: boolean;
  abortController: AbortController; // Per-component abort lifecycle
  ssr?: boolean; // Set to true for SSR temporary instances
  stateValues: State<unknown>[]; // Persistent state storage across renders
  evaluationGeneration: number; // Prevents stale async evaluation completions
  notifyUpdate: (() => void) | null; // Callback for state updates (persisted on instance)
  stateIndexCheck: number; // Track state indices to catch conditional calls
  expectedStateIndices: number[]; // Expected sequence of state indices (frozen after first render)
  firstRenderComplete: boolean; // Flag to detect transition from first to subsequent renders
  mountOperations: Array<
    () => void | (() => void) | Promise<void | (() => void)>
  >; // Operations to run when component mounts
  cleanupFns: Array<() => void>; // Cleanup functions to run on unmount
  hasPendingUpdate: boolean; // Flag to batch state updates (coalescing)
  ownerFrame: ContextFrame | null; // Provider chain for this component (set by Scope, never overwritten)
  isRoot?: boolean;
}

export function createComponentInstance(
  id: string,
  fn: ComponentFunction,
  props: Props,
  target: Element | null
): ComponentInstance {
  return {
    id,
    fn,
    props,
    target,
    mounted: false,
    abortController: new AbortController(), // Create per-component
    stateValues: [],
    evaluationGeneration: 0,
    notifyUpdate: null,
    stateIndexCheck: -1,
    expectedStateIndices: [],
    firstRenderComplete: false,
    mountOperations: [],
    cleanupFns: [],
    hasPendingUpdate: false,
    ownerFrame: null, // Will be set by renderer when vnode is marked
    ssr: false,
    isRoot: false,
  };
}

let currentInstance: ComponentInstance | null = null;
let stateIndex = 0;

// Export for state.ts to access
export function getCurrentComponentInstance(): ComponentInstance | null {
  return currentInstance;
}

// Export for SSR to set temporary instance
export function setCurrentComponentInstance(
  instance: ComponentInstance | null
): void {
  currentInstance = instance;
}

/**
 * Register a mount operation that will run after the component is mounted
 * Used by operations (task, on, timer, etc) to execute after render completes
 */
import { isBulkCommitActive } from './fastlane';

export function registerMountOperation(
  operation: () => void | (() => void) | Promise<void | (() => void)>
): void {
  const instance = getCurrentComponentInstance();
  if (instance) {
    // If we're in bulk-commit fast lane, registering mount operations is a
    // violation of the fast-lane preconditions. Throw in dev, otherwise ignore.
    if (process.env.NODE_ENV !== 'production' && isBulkCommitActive()) {
      throw new Error(
        'registerMountOperation called during bulk commit fast-lane'
      );
    }
    try {
      logger.debug('[Askr] registerMountOperation on', instance.id);
    } catch {
      // ignore logging errors
    }
    instance.mountOperations.push(operation);
  }
}

/**
 * Execute all mount operations for a component
 * These run after the component is rendered and mounted to the DOM
 */
function executeMountOperations(instance: ComponentInstance): void {
  try {
    logger.debug(
      '[Askr] executeMountOperations for',
      instance.id,
      'count',
      instance.mountOperations.length
    );
  } catch {
    // ignore logging errors
  }

  // Only execute mount operations for root app instance. Child component
  // operations are currently registered but should not be executed (per
  // contract tests). They remain registered for cleanup purposes.
  if (!instance.isRoot) return;

  for (const operation of instance.mountOperations) {
    try {
      logger.debug('[Askr] executing mount op for', instance.id);
    } catch {
      // ignore logging errors
    }
    const result = operation();
    if (result instanceof Promise) {
      result.then((cleanup) => {
        if (typeof cleanup === 'function') {
          instance.cleanupFns.push(cleanup);
        }
      });
    } else if (typeof result === 'function') {
      instance.cleanupFns.push(result);
    }
  }
  // Clear the operations array so they don't run again on subsequent renders
  instance.mountOperations = [];
}

export function mountInstanceInline(
  instance: ComponentInstance,
  target: Element | null
): void {
  instance.target = target;
  // Ensure notifyUpdate is available for async resource completions that may
  // try to trigger re-render. This mirrors the setup in executeComponent().
  instance.notifyUpdate = () => {
    globalScheduler.enqueue(() => runComponent(instance));
  };

  const wasFirstMount = !instance.mounted;
  instance.mounted = true;
  if (wasFirstMount && instance.mountOperations.length > 0) {
    executeMountOperations(instance);
  }
}

/**
 * Run a component synchronously: execute function, handle result
 * This is the internal workhorse that manages async continuations and generation tracking.
 * Must always be called through the scheduler.
 *
 * ACTOR INVARIANT: This function is enqueued as a task, never called directly.
 */
function runComponent(instance: ComponentInstance): void {
  // CRITICAL: Ensure notifyUpdate is available for state.set() calls during this render.
  // This must be set before executeComponentSync() runs, not after.
  instance.notifyUpdate = () => {
    // OPTIMIZATION: Batch state updates from the same component within the same event loop tick
    if (!instance.hasPendingUpdate) {
      instance.hasPendingUpdate = true;
      // INVARIANT: All state updates go through scheduler
      globalScheduler.enqueue(() => {
        instance.hasPendingUpdate = false;
        runComponent(instance);
      });
    }
  };

  // Atomic rendering: capture DOM state for rollback on error
  const domSnapshot = instance.target ? instance.target.innerHTML : '';

  const result = executeComponentSync(instance);
  if (result instanceof Promise) {
    // Async components are not supported. Components must be synchronous and
    // must not return a Promise from their render function.
    throw new Error(
      'Async components are not supported. Components must be synchronous.'
    );
  } else {
    // Try runtime fast-lane synchronously; if it activates we do not enqueue
    // follow-up work and the commit happens atomically in this task.
    // (Runtime fast-lane has conservative preconditions.)
    const fastlaneBridge = (
      globalThis as unknown as {
        __ASKR_FASTLANE?: {
          tryRuntimeFastLaneSync?: (
            instance: unknown,
            result: unknown
          ) => boolean;
        };
      }
    ).__ASKR_FASTLANE;
    try {
      const used = fastlaneBridge?.tryRuntimeFastLaneSync?.(instance, result);
      if (used) return;
    } catch (err) {
      // If invariant check failed in dev, surface the error; otherwise fall back
      if (process.env.NODE_ENV !== 'production') throw err;
    }

    // Fallback: enqueue the render/commit normally
    globalScheduler.enqueue(() => {
      if (instance.target) {
        try {
          const wasFirstMount = !instance.mounted;
          // Ensure nested component executions during evaluation have access to
          // the current component instance. This allows nested components to
          // call `state()`, `resource()`, and other runtime helpers which
          // rely on `getCurrentComponentInstance()` being available.
          const oldInstance = currentInstance;
          currentInstance = instance;
          try {
            evaluate(result, instance.target);
          } finally {
            currentInstance = oldInstance;
          }

          instance.mounted = true;
          // Execute mount operations after first mount (do NOT run these with
          // currentInstance set - they may perform state mutations/registrations)
          if (wasFirstMount && instance.mountOperations.length > 0) {
            executeMountOperations(instance);
          }
        } catch (renderError) {
          // Atomic rendering: rollback on render error
          instance.target.innerHTML = domSnapshot;
          throw renderError;
        }
      }
    });
  }
}

/**
 * Execute a component's render function synchronously.
 * Returns either a vnode/promise immediately (does NOT render).
 * Rendering happens separately through runComponent.
 */
export function renderComponentInline(
  instance: ComponentInstance
): unknown | Promise<unknown> {
  return executeComponentSync(instance);
}

function executeComponentSync(
  instance: ComponentInstance
): unknown | Promise<unknown> {
  // Reset state index tracking for this render
  instance.stateIndexCheck = -1;

  // Reset read tracking for all existing state
  for (const state of instance.stateValues) {
    if (state) {
      state._hasBeenRead = false;
    }
  }

  currentInstance = instance;
  stateIndex = 0;

  try {
    logger.debug('[Askr] executing component fn for', instance.id);
  } catch {
    // ignore logging errors
  }

  try {
    // Track render time in dev mode
    const renderStartTime =
      process.env.NODE_ENV !== 'production' ? Date.now() : 0;

    // Create context object with abort signal
    const context = {
      signal: instance.abortController.signal,
    };

    // Execute component within its owner frame (provider chain).
    // This ensures all context reads see the correct provider values.
    // We create a new execution frame whose parent is the ownerFrame. The
    // `values` map is lazily allocated to avoid per-render Map allocations
    // for components that do not use context.
    const executionFrame: ContextFrame = {
      parent: instance.ownerFrame,
      values: null,
    };
    const result = withContext(executionFrame, () =>
      instance.fn(instance.props, context)
    );

    // Check render time in dev mode
    if (process.env.NODE_ENV !== 'production') {
      const renderTime = Date.now() - renderStartTime;
      if (renderTime > 5) {
        // Warn if render takes more than 5ms
        logger.warn(
          `[askr] Slow render detected: ${renderTime}ms. Consider optimizing component performance.`
        );
      }
    }

    // Mark first render complete after successful execution
    // This enables hook order validation on subsequent renders
    if (!instance.firstRenderComplete) {
      instance.firstRenderComplete = true;
    }

    // Check for unused state in dev mode
    if (process.env.NODE_ENV !== 'production') {
      for (let i = 0; i < instance.stateValues.length; i++) {
        const state = instance.stateValues[i];
        if (state && !state._hasBeenRead) {
          logger.warn(
            `[askr] Unused state variable detected. State should be read during render or removed.`
          );
        }
      }
    }

    return result;
  } finally {
    // Synchronous path: we did not push a fresh frame, so nothing to pop here.
    currentInstance = null;
  }
}

/**
 * Public entry point: Execute component with full lifecycle (execute + render)
 * Handles both initial mount and re-execution. Always enqueues through scheduler.
 * Single entry point to avoid lifecycle divergence.
 */
export function executeComponent(instance: ComponentInstance): void {
  // Create a fresh abort controller on mount to allow remounting
  // (old one may have been aborted during previous cleanup)
  instance.abortController = new AbortController();

  // Setup notifyUpdate callback: enqueues re-render, never executes directly
  instance.notifyUpdate = () => {
    globalScheduler.enqueue(() => runComponent(instance));
  };

  // Enqueue the initial component run
  globalScheduler.enqueue(() => runComponent(instance));
}

export function getCurrentInstance(): ComponentInstance | null {
  return currentInstance;
}

/**
 * Get the abort signal for the current component
 * Used to cancel async operations on unmount/navigation
 *
 * The signal is guaranteed to be aborted when:
 * - Component unmounts
 * - Navigation occurs (different route)
 * - Parent is destroyed
 *
 * IMPORTANT: getSignal() must be called during component render execution.
 * It captures the current component instance from context.
 *
 * @returns AbortSignal that will be aborted when component unmounts
 * @throws Error if called outside component execution
 *
 * @example
 * ```ts
 * // ✅ Correct: called during render, used in async operation
 * export async function UserPage({ id }: { id: string }) {
 *   const signal = getSignal();
 *   const user = await fetch(`/api/users/${id}`, { signal });
 *   return <div>{user.name}</div>;
 * }
 *
 * // ✅ Correct: passed to event handler
 * export function Button() {
 *   const signal = getSignal();
 *   return {
 *     type: 'button',
 *     props: {
 *       onClick: async () => {
 *         const data = await fetch(url, { signal });
 *       }
 *     }
 *   };
 * }
 *
 * // ❌ Wrong: called outside component context
 * const signal = getSignal(); // Error: not in component
 * ```
 */
export function getSignal(): AbortSignal {
  if (!currentInstance) {
    throw new Error(
      'getSignal() can only be called during component render execution. ' +
        'Ensure you are calling this from inside your component function.'
    );
  }
  return currentInstance.abortController.signal;
}

export function getNextStateIndex(): number {
  return stateIndex++;
}

/**
 * Mount a component instance.
 * This is just an alias to executeComponent() to maintain API compatibility.
 * All lifecycle logic is unified in executeComponent().
 */
export function mountComponent(instance: ComponentInstance): void {
  executeComponent(instance);
}

/**
 * Clean up component — abort pending operations
 * Called on unmount or route change
 */
export function cleanupComponent(instance: ComponentInstance): void {
  // Execute cleanup functions (from mount effects)
  for (const cleanup of instance.cleanupFns) {
    cleanup();
  }
  instance.cleanupFns = [];

  // Abort all pending operations
  instance.abortController.abort();
}
