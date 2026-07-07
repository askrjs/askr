/**
 * Component instance lifecycle management
 * Internal only — users never see this
 */

import { type State } from './state';
import { enqueueRuntimeTask } from './access';
import type { Props } from '../common/props';
import type { ComponentFunction } from '../common/component';
import {
  // withContext is the sole primitive for context restoration
  withContext,
  type ContextFrame,
} from './context';
import { type ReadableSource, finalizeReadableSubscriptions } from './readable';
import {
  isDevelopmentEnvironment,
  isProductionEnvironment,
} from '../common/env';
import { logger } from '../common/logger';
import { incDevCounter } from './dev-namespace';
import {
  cleanupComponent,
  registerOwnedChildScope,
  unregisterOwnedChildScope,
  type OwnedChildScope,
} from './component-cleanup';
import { runScheduledComponent } from './component-commit';
import {
  captureInlineRenderSnapshot as captureLifecycleInlineRenderSnapshot,
  commitLifecycleForInstance,
  commitRenderedComponent as commitRenderedLifecycleComponent,
  discardCommitOperations,
  finalizeInlineReadSubscriptions,
  registerCommitOperationForInstance,
  registerMountOperationForInstance,
  type LifecycleOperation,
} from './component-lifecycle';
import {
  beginRenderTracking,
  captureInlineComponentScope,
  captureInlineRenderTracking,
  clearRenderTracking,
  enterComponentExecutionScope,
  enterRenderScopedComponent,
  exitComponentExecutionScope,
  getCurrentComponentInstance,
  getCurrentInstance,
  getCurrentPortalScope,
  getSignalForInstance,
  resetRenderState,
  restoreInlineComponentScope,
  restoreInlineRenderTracking,
  restoreRenderScopedComponent,
} from './component-scope';

export type { ComponentFunction } from '../common/component';
export { cleanupComponent, registerOwnedChildScope, unregisterOwnedChildScope };

export interface ComponentInstance {
  id: string;
  fn: ComponentFunction;
  props: Props;
  target: Element | null;
  parentInstance: ComponentInstance | null;
  portalScope: object | null;
  mounted: boolean;
  abortController: AbortController | null; // Lazily created per-component abort lifecycle
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
  expectedStateIndices: number[]; // Expected sequence of render-scoped hook indices (frozen after first render)
  firstRenderComplete: boolean; // Flag to detect transition from first to subsequent renders
  mountOperations: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >; // Operations to run when component mounts
  commitOperations: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >; // Operations to run after a successful committed render
  cleanupFns: Array<() => void>; // Cleanup functions to run on unmount
  lifecycleSlots: unknown[]; // Render-scoped lifecycle primitive storage
  lifecycleGeneration: number; // Invalidates async mount-operation settlement after disposal
  hasPendingUpdate: boolean; // Flag to batch state updates (coalescing)
  ownerFrame: ContextFrame | null; // Provider chain for this component (set by Scope, never overwritten)
  isRoot?: boolean;

  // Render-tracking for precise subscriptions (internal)
  _currentRenderToken?: number; // Token for the in-progress render (set before render)
  lastRenderToken?: number; // Token of the last *committed* render
  _pendingReadSources?: Set<ReadableSource<unknown>>; // Readables read during the in-progress render
  _pendingReadSourceVersions?: Map<ReadableSource<unknown>, number>; // Source versions captured during the in-progress render
  _lastReadSources?: Set<ReadableSource<unknown>>; // Readables read during the last committed render
  devWarningsEmitted?: Set<string>; // Dev-only warning dedupe for this instance

  // Placeholder for null-returning components. When a component initially returns
  // null, we create a comment placeholder so updates can replace it with content.
  _placeholder?: Comment;
  _ownedChildScopes?: Set<OwnedChildScope>;
  errorBoundaryState?: {
    error: unknown | null;
    resetKey: unknown;
    notified: boolean;
  };
}

export function createComponentInstance(
  id: string,
  fn: ComponentFunction,
  props: Props,
  target: Element | null
): ComponentInstance {
  const parentInstance = getCurrentInstance();
  const portalScope = parentInstance?.portalScope ?? getCurrentPortalScope();
  const instance: ComponentInstance = {
    id,
    fn,
    props,
    target,
    parentInstance,
    portalScope: portalScope ?? null,
    mounted: false,
    abortController: null,
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
    commitOperations: [],
    cleanupFns: [],
    lifecycleSlots: [],
    lifecycleGeneration: 0,
    hasPendingUpdate: false,
    ownerFrame: null, // Will be set by renderer when vnode is marked
    ssr: false,
    cleanupStrict: false,
    isRoot: false,

    // Render-tracking (for precise state subscriptions)
    _currentRenderToken: undefined,
    lastRenderToken: 0,
    _pendingReadSources: undefined,
    _pendingReadSourceVersions: undefined,
    _lastReadSources: undefined,
    devWarningsEmitted: undefined,
  };

  // Initialize prebound helper tasks once per instance to avoid allocations
  instance._pendingRunTask = () => {
    // Clear pending flag when the run task executes
    instance.hasPendingUpdate = false;
    if (instance.notifyUpdate === null) {
      return;
    }
    // Execute component run (will set up notifyUpdate before render)
    runScheduledComponent(instance, {
      execute: executeComponentSync,
      finalizeReadSubscriptions,
      warnUnusedStateReads,
      commitRenderedComponent,
    });
  };

  instance._enqueueRun = () => {
    if (!instance.hasPendingUpdate) {
      instance.hasPendingUpdate = true;
      // Enqueue single run task (coalesces multiple writes)
      enqueueRuntimeTask(instance._pendingRunTask!);
    }
  };

  // Default state-driven updates enqueue the run task directly. Specialized
  // runtimes (for example `For` item instances) can still override this hook.
  instance._pendingFlushTask = instance._pendingRunTask;

  return instance;
}

/**
 * Register a mount operation that will run after the component is mounted
 * Used by operations (task, on, timer, etc) to execute after render completes
 */
export function captureInlineRenderSnapshot(instance: ComponentInstance): void {
  captureLifecycleInlineRenderSnapshot(instance);
}

export function registerMountOperation(operation: LifecycleOperation): void {
  registerMountOperationForInstance(getCurrentComponentInstance(), operation);
}

export function registerCommitOperation(operation: LifecycleOperation): void {
  registerCommitOperationForInstance(getCurrentComponentInstance(), operation);
}

export function commitRenderedComponent(instance: ComponentInstance): void {
  commitRenderedLifecycleComponent(instance);
}

export function mountInstanceInline(
  instance: ComponentInstance,
  target: Element | null
): void {
  instance.target = target;
  // Record backref on host element so renderer can clean up when the
  // node is removed. Avoids leaks if the node is detached or replaced.
  try {
    if (target instanceof Element) {
      const host = target as Element & {
        __ASKR_INSTANCE?: ComponentInstance;
        __ASKR_INSTANCES?: ComponentInstance[];
      };
      const instances = host.__ASKR_INSTANCES ?? [];
      const nextInstances = instances.filter((entry) => entry !== instance);
      nextInstances.push(instance);
      host.__ASKR_INSTANCES = nextInstances;
      host.__ASKR_INSTANCE = nextInstances[0] ?? instance;
    }
  } catch (err) {
    void err;
  }

  // Ensure notifyUpdate is available for async resource completions that may
  // try to trigger re-render. This mirrors the setup in executeComponent().
  // Use prebound enqueue helper to avoid allocating a new closure
  instance.notifyUpdate = instance._enqueueRun!;

  const wasFirstMount = !instance.mounted;
  instance.mounted = true;
  commitLifecycleForInstance(instance, wasFirstMount);
}

/**
 * Run a component synchronously: execute function, handle result
 * This is the internal workhorse that manages async continuations and generation tracking.
 * Must always be called through the scheduler.
 *
 * ACTOR INVARIANT: This function is enqueued as a task, never called directly.
 */

export function renderScopedComponent<T>(
  instance: ComponentInstance,
  startStateIndex: number,
  render: () => T
): T {
  instance.notifyUpdate = instance._enqueueRun!;
  resetRenderState(instance);
  beginRenderTracking(instance);
  const savedScope = enterRenderScopedComponent(instance, startStateIndex);

  let didComplete = false;

  try {
    const executionFrame: ContextFrame = {
      parent: instance.ownerFrame,
      values: null,
    };
    const result = withContext(executionFrame, render);
    didComplete = true;
    return result;
  } finally {
    if (!didComplete) {
      clearRenderTracking(instance);
    }
    restoreRenderScopedComponent(savedScope);
  }
}

/**
 * Execute a component's render function synchronously.
 * Returns either a vnode/promise immediately (does NOT render).
 * Rendering happens separately through the scheduled commit helper.
 */
export function renderComponentInline(
  instance: ComponentInstance
): unknown | Promise<unknown> {
  // Reused inline instances can cross renderer cleanup boundaries while their
  // host node is retained. Make sure state writes still enqueue this instance.
  instance.notifyUpdate = instance._enqueueRun!;

  // Ensure inline executions (rendered during parent's evaluate) still
  // receive a render token and have their state reads finalized so
  // subscriptions are correctly recorded. If this function is called
  // as part of a scheduled run, the token will already be set by
  // runComponent and we should not overwrite it.
  const trackingSnapshot = captureInlineRenderTracking(instance);
  const scopeSnapshot = captureInlineComponentScope();
  const hadToken = trackingSnapshot.currentRenderToken !== undefined;

  if (!hadToken) {
    beginRenderTracking(instance);
  }

  try {
    const result = executeComponentSync(instance);
    // If we set the token for inline execution, finalize subscriptions now
    // unless the parent DOM commit is still provisional. Renderer commit
    // batches flush these reads only after DOM evaluation succeeds.
    if (!hadToken) {
      finalizeInlineReadSubscriptions(
        instance,
        instance._currentRenderToken!,
        instance._pendingReadSources,
        instance._pendingReadSourceVersions
      );
    }
    commitRenderedComponent(instance);
    return result;
  } finally {
    // Restore previous token/read states for nested inline render scenarios
    restoreInlineRenderTracking(instance, trackingSnapshot);
    restoreInlineComponentScope(scopeSnapshot);
  }
}

export function warnUnusedStateReads(instance: ComponentInstance): void {
  for (let i = 0; i < instance.stateValues.length; i++) {
    const state = instance.stateValues[i];
    const hasCommittedUsage =
      (state?._readers?.size ?? 0) > 0 ||
      ((state as { _derivedSubscribers?: Set<unknown> } | undefined)
        ?._derivedSubscribers?.size ?? 0) > 0;

    if (
      state &&
      !state._hasBeenRead &&
      !state._hasEverBeenRead &&
      !hasCommittedUsage
    ) {
      try {
        const name = instance.fn?.name || '<anonymous>';
        warnInstanceOnce(
          instance,
          `unused-state:${i}`,
          `[askr] Unused state variable detected in ${name} at index ${i}. State should be read during render or removed.`
        );
      } catch {
        warnInstanceOnce(
          instance,
          `unused-state:${i}`,
          `[askr] Unused state variable detected. State should be read during render or removed.`
        );
      }
    }
  }
}

function executeComponentSync(
  instance: ComponentInstance
): unknown | Promise<unknown> {
  resetRenderState(instance);
  incDevCounter('componentRuns');
  incDevCounter('componentReruns');

  const savedPortalScope = enterComponentExecutionScope(instance);

  let didComplete = false;

  try {
    // Track render time in dev mode
    const renderStartTime = isDevelopmentEnvironment() ? Date.now() : 0;

    // Create context object with abort signal
    const context = {
      get signal(): AbortSignal {
        return getSignalForInstance(instance);
      },
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
      warnInstanceOnce(
        instance,
        'slow-render',
        `[askr] Slow render detected: ${renderTime}ms. Consider optimizing component performance.`
      );
    }

    // Mark first render complete after successful execution
    // This enables hook order validation on subsequent renders
    if (!instance.firstRenderComplete) {
      instance.firstRenderComplete = true;
    }

    didComplete = true;
    return result;
  } finally {
    if (!didComplete) {
      discardCommitOperations(instance);
    }
    // Synchronous path: we did not push a fresh frame, so nothing to pop here.
    exitComponentExecutionScope(savedPortalScope);
  }
}

/**
 * Public entry point: Execute component with full lifecycle (execute + render)
 * Handles both initial mount and re-execution. Always enqueues through scheduler.
 * Single entry point to avoid lifecycle divergence.
 */
export function executeComponent(instance: ComponentInstance): void {
  // Lazily recreate abort controller only when signal is actually requested.
  instance.abortController = null;

  // Setup notifyUpdate callback using prebound helper to avoid per-call closures
  instance.notifyUpdate = instance._enqueueRun!;

  // Enqueue the initial component run
  enqueueRuntimeTask(instance._pendingRunTask!);
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
  finalizeReadableSubscriptions(instance);
}

/**
 * Mount a component instance.
 * This is just an alias to executeComponent() to maintain API compatibility.
 * All lifecycle logic is unified in executeComponent().
 */
export function mountComponent(instance: ComponentInstance): void {
  executeComponent(instance);
}

function warnInstanceOnce(
  instance: ComponentInstance,
  key: string,
  message: string
): void {
  if (isProductionEnvironment()) return;
  const warnings = (instance.devWarningsEmitted ??= new Set());
  if (warnings.has(key)) return;
  warnings.add(key);
  logger.warn(message);
}
