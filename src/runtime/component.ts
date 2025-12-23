/**
 * Component instance lifecycle management
 * Internal only — users never see this
 */

import { type State } from './state';
import { globalScheduler } from './scheduler';
import type { JSXElement } from '../jsx/types';
import type { Props } from '../shared/types';
import {
  // withContext is the sole primitive for context restoration
  withContext,
  type ContextFrame,
} from './context';
import { logger } from '../dev/logger';
import { __ASKR_incCounter, __ASKR_set } from '../renderer/diag';

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
  // Opt-in strict cleanup mode: when true cleanup errors are aggregated and re-thrown
  cleanupStrict?: boolean;
  stateValues: State<unknown>[]; // Persistent state storage across renders
  evaluationGeneration: number; // Prevents stale async evaluation completions
  notifyUpdate: (() => void) | null; // Callback for state updates (persisted on instance)
  // Internal: prebound helpers to avoid per-update closures (allocation hot-path)
  _pendingFlushTask?: () => void; // Clears hasPendingUpdate and triggers notifyUpdate
  _pendingRunTask?: () => void; // Clears hasPendingUpdate and runs component
  _enqueueRun?: () => void; // Batches run requests and enqueues _pendingRunTask
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

  // Render-tracking for precise subscriptions (internal)
  _currentRenderToken?: number; // Token for the in-progress render (set before render)
  lastRenderToken?: number; // Token of the last *committed* render
  _pendingReadStates?: Set<State<unknown>>; // States read during the in-progress render
  _lastReadStates?: Set<State<unknown>>; // States read during the last committed render

  // Placeholder for null-returning components. When a component initially returns
  // null, we create a comment placeholder so updates can replace it with content.
  _placeholder?: Comment;
}

export function createComponentInstance(
  id: string,
  fn: ComponentFunction,
  props: Props,
  target: Element | null
): ComponentInstance {
  const instance: ComponentInstance = {
    id,
    fn,
    props,
    target,
    mounted: false,
    abortController: new AbortController(), // Create per-component
    stateValues: [],
    evaluationGeneration: 0,
    notifyUpdate: null,
    // Prebound helpers (initialized below) to avoid per-update allocations
    _pendingFlushTask: undefined,
    _pendingRunTask: undefined,
    _enqueueRun: undefined,
    stateIndexCheck: -1,
    expectedStateIndices: [],
    firstRenderComplete: false,
    mountOperations: [],
    cleanupFns: [],
    hasPendingUpdate: false,
    ownerFrame: null, // Will be set by renderer when vnode is marked
    ssr: false,
    cleanupStrict: false,
    isRoot: false,

    // Render-tracking (for precise state subscriptions)
    _currentRenderToken: undefined,
    lastRenderToken: 0,
    _pendingReadStates: new Set(),
    _lastReadStates: new Set(),
  };

  // Initialize prebound helper tasks once per instance to avoid allocations
  instance._pendingRunTask = () => {
    // Clear pending flag when the run task executes
    instance.hasPendingUpdate = false;
    // Execute component run (will set up notifyUpdate before render)
    runComponent(instance);
  };

  instance._enqueueRun = () => {
    if (!instance.hasPendingUpdate) {
      instance.hasPendingUpdate = true;
      // Enqueue single run task (coalesces multiple writes)
      globalScheduler.enqueue(instance._pendingRunTask!);
    }
  };

  instance._pendingFlushTask = () => {
    // Called by state.set() when we want to flush a pending update
    instance.hasPendingUpdate = false;
    // Trigger a run via enqueue helper — this will schedule the component run
    instance._enqueueRun?.();
  };

  return instance;
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
import { isBulkCommitActive } from './fastlane-shared';
import { evaluate, cleanupInstancesUnder } from '../renderer';

export function registerMountOperation(
  operation: () => void | (() => void) | Promise<void | (() => void)>
): void {
  const instance = getCurrentComponentInstance();
  if (instance) {
    // If we're in bulk-commit fast lane, registering mount operations is a
    // violation of the fast-lane preconditions. Throw in dev, otherwise ignore
    // silently in production (we must avoid scheduling work during bulk commit).
    if (isBulkCommitActive()) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          'registerMountOperation called during bulk commit fast-lane'
        );
      }
      return;
    }
    instance.mountOperations.push(operation);
  }
}

/**
 * Execute all mount operations for a component
 * These run after the component is rendered and mounted to the DOM
 */
function executeMountOperations(instance: ComponentInstance): void {
  // Only execute mount operations for root app instance. Child component
  // operations are currently registered but should not be executed (per
  // contract tests). They remain registered for cleanup purposes.
  if (!instance.isRoot) return;

  for (const operation of instance.mountOperations) {
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
  // Record backref on host element so renderer can clean up when the
  // node is removed. Avoids leaks if the node is detached or replaced.
  try {
    if (target instanceof Element)
      (
        target as Element & { __ASKR_INSTANCE?: ComponentInstance }
      ).__ASKR_INSTANCE = instance;
  } catch (err) {
    void err;
  }

  // Ensure notifyUpdate is available for async resource completions that may
  // try to trigger re-render. This mirrors the setup in executeComponent().
  // Use prebound enqueue helper to avoid allocating a new closure
  instance.notifyUpdate = instance._enqueueRun!;

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
let _globalRenderCounter = 0;

function runComponent(instance: ComponentInstance): void {
  // CRITICAL: Ensure notifyUpdate is available for state.set() calls during this render.
  // This must be set before executeComponentSync() runs, not after.
  // Use prebound enqueue helper to avoid allocating per-render closures
  instance.notifyUpdate = instance._enqueueRun!;

  // Assign a token for this in-progress render and start a fresh pending-read set
  instance._currentRenderToken = ++_globalRenderCounter;
  instance._pendingReadStates = new Set();

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
      globalThis as {
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
      // Handle placeholder-based updates: when a component initially returned null,
      // we created a comment placeholder. If it now has content, we need to create
      // a host element and replace the placeholder.
      if (!instance.target && instance._placeholder) {
        // Component previously returned null (has placeholder), check if now has content
        if (result === null || result === undefined) {
          // Still null - nothing to do, keep placeholder
          finalizeReadSubscriptions(instance);
          return;
        }

        // Has content now - need to create DOM and replace placeholder
        const placeholder = instance._placeholder;
        const parent = placeholder.parentNode;
        if (!parent) {
          // Placeholder was removed from DOM - can't render
          logger.warn(
            '[Askr] placeholder no longer in DOM, cannot render component'
          );
          return;
        }

        // Create a new host element for the content
        const host = document.createElement('div');

        // Set up instance for normal updates
        const oldInstance = currentInstance;
        currentInstance = instance;
        try {
          evaluate(result, host);

          // Replace placeholder with host
          parent.replaceChild(host, placeholder);

          // Set up instance for future updates
          instance.target = host;
          instance._placeholder = undefined;
          (
            host as Element & { __ASKR_INSTANCE?: ComponentInstance }
          ).__ASKR_INSTANCE = instance;

          finalizeReadSubscriptions(instance);
        } finally {
          currentInstance = oldInstance;
        }
        return;
      }

      if (instance.target) {
        // Keep `oldChildren` in the outer scope so rollback handlers can
        // reference the original node list even if the inner try block
        // throws. This preserves listeners and instance backrefs on rollback.
        let oldChildren: Node[] = [];
        try {
          const wasFirstMount = !instance.mounted;
          // Ensure nested component executions during evaluation have access to
          // the current component instance. This allows nested components to
          // call `state()`, `resource()`, and other runtime helpers which
          // rely on `getCurrentComponentInstance()` being available.
          const oldInstance = currentInstance;
          currentInstance = instance;
          // Capture snapshot of current children (by reference) so we can
          // restore them on render failure without losing event listeners or
          // instance attachments.
          oldChildren = Array.from(instance.target.childNodes);

          try {
            evaluate(result, instance.target);
          } catch (e) {
            // If evaluation failed, attempt to cleanup any partially-added nodes
            // and restore the old children to preserve listeners and instances.
            try {
              const newChildren = Array.from(instance.target.childNodes);
              for (const n of newChildren) {
                try {
                  cleanupInstancesUnder(n);
                } catch (err) {
                  logger.warn(
                    '[Askr] error cleaning up failed commit children:',
                    err
                  );
                }
              }
            } catch (_err) {
              void _err;
            }

            // Restore original children by re-inserting the old node references
            // this preserves attached listeners and instance backrefs.
            try {
              __ASKR_incCounter('__DOM_REPLACE_COUNT');
              __ASKR_set(
                '__LAST_DOM_REPLACE_STACK_COMPONENT_RESTORE',
                new Error().stack
              );
            } catch (e) {
              void e;
            }
            instance.target.replaceChildren(...oldChildren);
            throw e;
          } finally {
            currentInstance = oldInstance;
          }

          // Commit succeeded — finalize recorded state reads so subscriptions reflect
          // the last *committed* render. This updates per-state reader maps
          // deterministically and synchronously with the commit.
          finalizeReadSubscriptions(instance);

          instance.mounted = true;
          // Execute mount operations after first mount (do NOT run these with
          // currentInstance set - they may perform state mutations/registrations)
          if (wasFirstMount && instance.mountOperations.length > 0) {
            executeMountOperations(instance);
          }
        } catch (renderError) {
          // Atomic rendering: rollback on render error. Attempt non-lossy restore of
          // original child node references to preserve listeners/instances.
          try {
            const currentChildren = Array.from(instance.target.childNodes);
            for (const n of currentChildren) {
              try {
                cleanupInstancesUnder(n);
              } catch (err) {
                logger.warn(
                  '[Askr] error cleaning up partial children during rollback:',
                  err
                );
              }
            }
          } catch (_err) {
            void _err;
          }

          try {
            try {
              __ASKR_incCounter('__DOM_REPLACE_COUNT');
              __ASKR_set(
                '__LAST_DOM_REPLACE_STACK_COMPONENT_ROLLBACK',
                new Error().stack
              );
            } catch (e) {
              void e;
            }
            instance.target.replaceChildren(...oldChildren);
          } catch {
            // Fallback to innerHTML restore if replaceChildren fails for some reason.
            instance.target.innerHTML = domSnapshot;
          }

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
  // Ensure inline executions (rendered during parent's evaluate) still
  // receive a render token and have their state reads finalized so
  // subscriptions are correctly recorded. If this function is called
  // as part of a scheduled run, the token will already be set by
  // runComponent and we should not overwrite it.
  const hadToken = instance._currentRenderToken !== undefined;
  const prevToken = instance._currentRenderToken;
  const prevPendingReads = instance._pendingReadStates;
  if (!hadToken) {
    instance._currentRenderToken = ++_globalRenderCounter;
    instance._pendingReadStates = new Set();
  }

  try {
    const result = executeComponentSync(instance);
    // If we set the token for inline execution, finalize subscriptions now
    // because the component is effectively committed as part of the parent's
    // synchronous evaluation.
    if (!hadToken) {
      finalizeReadSubscriptions(instance);
    }
    return result;
  } finally {
    // Restore previous token/read states for nested inline render scenarios
    instance._currentRenderToken = prevToken;
    instance._pendingReadStates = prevPendingReads ?? new Set();
  }
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

  // Prepare pending read set for this render (reads will be finalized on commit)
  instance._pendingReadStates = new Set();

  currentInstance = instance;
  stateIndex = 0;

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

    // Check render time
    const renderTime = Date.now() - renderStartTime;
    if (renderTime > 5) {
      // Warn if render takes more than 5ms
      logger.warn(
        `[askr] Slow render detected: ${renderTime}ms. Consider optimizing component performance.`
      );
    }

    // Mark first render complete after successful execution
    // This enables hook order validation on subsequent renders
    if (!instance.firstRenderComplete) {
      instance.firstRenderComplete = true;
    }

    // Check for unused state
    for (let i = 0; i < instance.stateValues.length; i++) {
      const state = instance.stateValues[i];
      if (state && !state._hasBeenRead) {
        try {
          const name = instance.fn?.name || '<anonymous>';
          logger.warn(
            `[askr] Unused state variable detected in ${name} at index ${i}. State should be read during render or removed.`
          );
        } catch {
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

  // Setup notifyUpdate callback using prebound helper to avoid per-call closures
  instance.notifyUpdate = instance._enqueueRun!;

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

/**
 * Finalize read subscriptions for an instance after a successful commit.
 * - Update per-state readers map to point to this instance's last committed token
 * - Remove this instance from states it no longer reads
 * This is deterministic and runs synchronously with commit to ensure
 * subscribers are only notified when they actually read a state in their
 * last committed render.
 */
export function finalizeReadSubscriptions(instance: ComponentInstance): void {
  const newSet = instance._pendingReadStates ?? new Set();
  const oldSet = instance._lastReadStates ?? new Set();
  const token = instance._currentRenderToken;

  if (token === undefined) return;

  // Remove subscriptions for states that were read previously but not in this render
  for (const s of oldSet) {
    if (!newSet.has(s)) {
      const readers = (s as State<unknown>)._readers;
      if (readers) readers.delete(instance);
    }
  }

  // Commit token becomes the authoritative token for this instance's last render
  instance.lastRenderToken = token;

  // Record subscriptions for states read during this render
  for (const s of newSet) {
    let readers = (s as State<unknown>)._readers;
    if (!readers) {
      readers = new Map();
      // s is a State object; assign its _readers map
      (s as State<unknown>)._readers = readers;
    }
    readers.set(instance, instance.lastRenderToken ?? 0);
  }

  instance._lastReadStates = newSet;
  instance._pendingReadStates = new Set();
  instance._currentRenderToken = undefined;
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
  const cleanupErrors: unknown[] = [];
  for (const cleanup of instance.cleanupFns) {
    try {
      cleanup();
    } catch (err) {
      if (instance.cleanupStrict) {
        cleanupErrors.push(err);
      } else {
        // Preserve previous behavior: log warnings in dev and continue
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('[Askr] cleanup function threw:', err);
        }
      }
    }
  }
  instance.cleanupFns = [];
  if (cleanupErrors.length > 0) {
    // If strict mode, surface all cleanup errors as an AggregateError after attempting all cleanups
    throw new AggregateError(
      cleanupErrors,
      `Cleanup failed for component ${instance.id}`
    );
  }

  // Remove deterministic state subscriptions for this instance
  if (instance._lastReadStates) {
    for (const s of instance._lastReadStates) {
      const readers = (s as State<unknown>)._readers;
      if (readers) readers.delete(instance);
    }
    instance._lastReadStates = new Set();
  }

  // Abort all pending operations
  instance.abortController.abort();

  // Clear update callback to prevent dangling references and stale updates
  instance.notifyUpdate = null;

  // Mark instance as unmounted so external tracking (e.g., portal host lists)
  // can deterministically prune stale instances. Not marking this leads to
  // retained "mounted" flags across cleanup boundaries which breaks
  // owner selection in the portal fallback.
  instance.mounted = false;
}
