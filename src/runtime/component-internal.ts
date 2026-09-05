/**
 * Component instance lifecycle management
 * Internal only — users never see this
 */

import { type State } from './state';
import { enqueueRuntimeTask, getRuntimeRenderer } from './access';
import type { Props } from '../common/props';
import type { ComponentFunction } from '../common/component';
import {
  // withContext is the sole primitive for context restoration
  callWithContext,
  getExecutionContextFrame,
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
import { shouldWarnSlowRender } from './render-diagnostics';
import {
  cleanupComponent,
  registerOwnedChildScope,
  unregisterOwnedChildScope,
} from './component-cleanup';
import {
  componentRecordPrototype,
  getOwnershipSignal,
  OwnershipRecord,
} from './ownership';
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
  resetRenderState,
  restoreInlineComponentScope,
  restoreInlineRenderTracking,
  restoreRenderScopedComponent,
} from './component-scope';
import type { AppRenderRuntime } from '../common/app-render-runtime';

// Production modules never enter diagnostic render timing. Development/test
// modules retain the runtime environment check for prod-fallback coverage.
const PRODUCTION_BUILD_ENABLED = isProductionEnvironment();

export type { ComponentFunction } from '../common/component';
export { cleanupComponent, registerOwnedChildScope, unregisterOwnedChildScope };

export interface ComponentInstance {
  id: string;
  fn: ComponentFunction;
  props: Props;
  target: Element | null;
  parentInstance: ComponentInstance | null;
  portalScope: object | null;
  ownership: OwnershipRecord;
  ssr?: boolean; // Set to true for SSR temporary instances
  // Opt-in strict cleanup mode: when true cleanup errors are aggregated and re-thrown
  cleanupStrict?: boolean;
  stateValues?: State<unknown>[]; // Persistent state storage across renders
  evaluationGeneration: number; // Prevents stale async evaluation completions
  notifyUpdate: (() => void) | null; // Callback for state updates (persisted on instance)
  // Internal: prebound helpers to avoid per-update closures (allocation hot-path)
  _pendingFlushTask?: () => void; // Clears hasPendingUpdate and triggers notifyUpdate
  _pendingRunTask?: () => void; // Clears hasPendingUpdate and runs component
  _enqueueRun?: () => void; // Batches run requests and enqueues _pendingRunTask
  stateIndexCheck: number; // Track state indices to catch conditional calls
  expectedStateIndices?: number[]; // Expected sequence of render-scoped hook indices (frozen after first render)
  firstRenderComplete: boolean; // Flag to detect transition from first to subsequent renders
  mountOperations?: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >; // Operations to run when component mounts
  commitOperations?: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >; // Operations to run after a successful committed render
  lifecycleSlots?: unknown[]; // Render-scoped lifecycle primitive storage
  lifecycleGeneration: number; // Invalidates async mount-operation settlement after disposal
  hasPendingUpdate: boolean; // Flag to batch state updates (coalescing)
  ownerFrame: ContextFrame | null; // Provider chain for this component (set by Scope, never overwritten)
  isRoot?: boolean;
  _rootComponentFn?: ComponentFunction;
  /** @internal Browser-owned hydration and route state for this app root. */
  _appRenderRuntime?: AppRenderRuntime;
  /** @internal CSP nonce retained across browser route navigation. */
  _cspNonce?: string;

  // Renderer ownership identity. A host can contain a retained wrapper chain,
  // so component type alone is not a safe reuse key.
  _vnodeOwner?: object;
  _vnodeParent?: ComponentInstance | null;
  _vnodeParentGeneration?: object;
  _vnodeKey?: string | number;
  _vnodePosition?: number;
  _wrapperDepth?: number;

  // Render-tracking for precise subscriptions (internal)
  _currentRenderToken?: number; // Token for the in-progress render (set before render)
  lastRenderToken?: number; // Token of the last *committed* render
  _pendingReadSources?: Set<ReadableSource<unknown>>; // Readables read during the in-progress render
  _pendingReadSourceVersions?: Map<ReadableSource<unknown>, number>; // Source versions captured during the in-progress render
  devWarningsEmitted?: Set<string>; // Dev-only warning dedupe for this instance

  // Placeholder for null-returning components. When a component initially returns
  // null, we create a comment placeholder so updates can replace it with content.
  _placeholder?: Comment;
  errorBoundaryState?: {
    error: unknown | null;
    resetKey: unknown;
    notified: boolean;
  };
  /** @internal Logical error ancestry for content materialized by a portal host. */
  _portalErrorParent?: ComponentInstance | null;
  /** @internal Ownership identity paired with `_portalErrorParent`. */
  _portalErrorParentGeneration?: object;
}

function ensurePendingRunTask(instance: ComponentInstance): () => void {
  const existing = instance._pendingRunTask;
  if (existing) {
    return existing;
  }

  const task = () => {
    // An ancestor reconciliation can render this instance inline before its
    // queued descendant task runs. The inline render has already consumed the
    // pending update, so the queued task must not commit it a second time.
    if (!instance.hasPendingUpdate) {
      return;
    }
    instance.hasPendingUpdate = false;
    if (instance.notifyUpdate === null) {
      return;
    }
    runScheduledComponent(instance, {
      execute: executeComponentSync,
      finalizeReadSubscriptions,
      commitRenderedComponent,
    });
  };
  instance._pendingRunTask = task;
  if (!instance._pendingFlushTask) {
    instance._pendingFlushTask = task;
  }
  return task;
}

function enqueueComponentRun(this: ComponentInstance): void {
  if (this.ownership.disposed || this.hasPendingUpdate) {
    return;
  }

  this.hasPendingUpdate = true;
  enqueueRuntimeTask(ensurePendingRunTask(this));
}

class ComponentExecutionContext {
  constructor(private readonly owner: OwnershipRecord) {}

  get signal(): AbortSignal {
    return getOwnershipSignal(this.owner);
  }
}

export function createComponentInstance(
  id: string,
  fn: ComponentFunction,
  props: Props,
  target: Element | null
): ComponentInstance {
  const parentInstance = getCurrentInstance();
  const portalScope = parentInstance?.portalScope ?? getCurrentPortalScope();
  const instance: ComponentInstance & { __proto__: object } = {
    __proto__: componentRecordPrototype,
    id,
    fn,
    props,
    target,
    parentInstance,
    portalScope: portalScope ?? null,
    ownership: new OwnershipRecord(),
    stateValues: undefined,
    evaluationGeneration: 0,
    notifyUpdate: null,
    _pendingFlushTask: undefined,
    _pendingRunTask: undefined,
    _enqueueRun: undefined,
    stateIndexCheck: -1,
    expectedStateIndices: undefined,
    firstRenderComplete: false,
    mountOperations: undefined,
    commitOperations: undefined,
    lifecycleSlots: undefined,
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
    devWarningsEmitted: undefined,
    _portalErrorParent: undefined,
    _portalErrorParentGeneration: undefined,
  };

  instance._enqueueRun = enqueueComponentRun;

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
  getRuntimeRenderer().recordInlineComponentHost(instance, target);

  // Ensure notifyUpdate is available for async resource completions that may
  // try to trigger re-render. This mirrors the setup in executeComponent().
  // Use prebound enqueue helper to avoid allocating a new closure
  instance.notifyUpdate = instance._enqueueRun!;

  const wasFirstMount = !instance.ownership.mounted;
  instance.ownership.mounted = true;
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
    const executionFrame = getExecutionContextFrame(instance.ownerFrame);
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
    if (!hadToken) {
      instance.hasPendingUpdate = false;
    }
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

export { warnUnusedStateReads } from './state-diagnostics';

function executeComponentSync(
  instance: ComponentInstance
): unknown | Promise<unknown> {
  resetRenderState(instance);
  incDevCounter('componentRuns');
  incDevCounter('componentReruns');

  const savedPortalScope = enterComponentExecutionScope(instance);

  let didComplete = false;

  try {
    const trackRenderTime =
      !PRODUCTION_BUILD_ENABLED && isDevelopmentEnvironment();
    const renderStartTime = trackRenderTime ? Date.now() : 0;

    // Create context object with abort signal
    const context = new ComponentExecutionContext(instance.ownership);

    // Execute component within its owner frame (provider chain).
    // This ensures all context reads see the correct provider values.
    // We create a new execution frame whose parent is the ownerFrame. The
    // `values` map is lazily allocated to avoid per-render Map allocations
    // for components that do not use context.
    const executionFrame = getExecutionContextFrame(instance.ownerFrame);
    const result = callWithContext(
      executionFrame,
      instance.fn,
      instance.props,
      context
    );

    if (trackRenderTime) {
      const renderTime = Date.now() - renderStartTime;
      if (shouldWarnSlowRender(renderTime)) {
        const componentName = instance.fn?.name || '<anonymous>';
        warnInstanceOnce(
          instance,
          'slow-render',
          `[askr] Slow render detected in ${componentName}: ${renderTime}ms. ` +
            'Consider optimizing component performance.'
        );
      }
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
  // Setup notifyUpdate callback using prebound helper to avoid per-call closures
  instance.notifyUpdate = instance._enqueueRun!;

  // Initial renders use the same cancellable task as state-driven rerenders.
  instance.hasPendingUpdate = true;
  enqueueRuntimeTask(ensurePendingRunTask(instance));
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
