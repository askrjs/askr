/**
 * Component instance lifecycle management
 * Internal only — users never see this
 */

import { type State } from './state';
import { globalScheduler } from './scheduler';
import type { Props } from '../common/props';
import type { ComponentFunction } from '../common/component';
import {
  // withContext is the sole primitive for context restoration
  withContext,
  type ContextFrame,
} from './context';
import {
  type ReadableSource,
  finalizeReadableSubscriptions,
  finalizeReadableSubscriptionsFromSnapshot,
  cleanupReadableSubscriptions,
} from './readable';
import {
  isDevelopmentEnvironment,
  isProductionEnvironment,
} from '../common/env';
import { logger } from '../dev/logger';
import { incDevCounter, setDevValue } from './dev-namespace';
import { isPromiseLike } from '../common/promise';
import {
  isBulkCommitActive,
  tryRuntimeFastLaneSync,
} from './fastlane';
import { getDefaultRuntime } from './runtime';

export type { ComponentFunction } from '../common/component';

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
  _ownedChildScopes?: Set<{
    key: string | number;
    dispose(): void;
  }>;
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
  const instance: ComponentInstance = {
    id,
    fn,
    props,
    target,
    parentInstance: currentInstance,
    portalScope: currentInstance?.portalScope ?? currentPortalScope ?? null,
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
    runComponent(instance);
  };

  instance._enqueueRun = () => {
    if (!instance.hasPendingUpdate) {
      instance.hasPendingUpdate = true;
      // Enqueue single run task (coalesces multiple writes)
      globalScheduler.enqueue(instance._pendingRunTask!);
    }
  };

  // Default state-driven updates enqueue the run task directly. Specialized
  // runtimes (for example `For` item instances) can still override this hook.
  instance._pendingFlushTask = instance._pendingRunTask;

  return instance;
}

let currentInstance: ComponentInstance | null = null;
let currentPortalScope: object | null = null;
let stateIndex = 0;

type OwnedChildScope = {
  key: string | number;
  dispose(): void;
};

function ensureAbortController(instance: ComponentInstance): AbortController {
  let controller = instance.abortController;
  if (!controller || controller.signal.aborted) {
    controller = new AbortController();
    instance.abortController = controller;
  }
  return controller;
}

// Export for state.ts to access
export function getCurrentComponentInstance(): ComponentInstance | null {
  return currentInstance;
}

// Export for SSR to set temporary instance
export function setCurrentComponentInstance(
  instance: ComponentInstance | null
): void {
  currentInstance = instance;
  currentPortalScope = instance?.portalScope ?? null;
}

export function getCurrentPortalScope(): object | null {
  return currentInstance?.portalScope ?? currentPortalScope;
}

/**
 * Register a mount operation that will run after the component is mounted
 * Used by operations (task, on, timer, etc) to execute after render completes
 */

type LifecycleOperation = () =>
  | void
  | (() => void)
  | PromiseLike<void | (() => void)>;

type LifecycleCommitBatchEntry = {
  instance: ComponentInstance;
  wasFirstMount: boolean;
};

type ReadSubscriptionCommit = {
  instance: ComponentInstance;
  token: number;
  pendingReadSources: Set<ReadableSource<unknown>> | undefined;
  pendingReadSourceVersions: Map<ReadableSource<unknown>, number> | undefined;
};

type InlineRenderSnapshot = {
  instance: ComponentInstance;
  props: Props;
  ownerFrame: ContextFrame | null;
  portalScope: object | null;
  parentInstance: ComponentInstance | null;
  isRoot: boolean | undefined;
};

type LifecycleCommitBatch = {
  parent: LifecycleCommitBatch | null;
  entries: LifecycleCommitBatchEntry[];
  entriesByInstance: Map<ComponentInstance, LifecycleCommitBatchEntry>;
  readCommits: ReadSubscriptionCommit[];
  readCommitsByInstance: Map<ComponentInstance, ReadSubscriptionCommit>;
  renderSnapshots: InlineRenderSnapshot[];
  renderSnapshotsByInstance: Map<ComponentInstance, InlineRenderSnapshot>;
  active: boolean;
};

let currentLifecycleCommitBatch: LifecycleCommitBatch | null = null;

function beginLifecycleCommitBatch(): LifecycleCommitBatch {
  const batch: LifecycleCommitBatch = {
    parent: currentLifecycleCommitBatch,
    entries: [],
    entriesByInstance: new Map(),
    readCommits: [],
    readCommitsByInstance: new Map(),
    renderSnapshots: [],
    renderSnapshotsByInstance: new Map(),
    active: true,
  };
  currentLifecycleCommitBatch = batch;
  return batch;
}

function closeLifecycleCommitBatch(batch: LifecycleCommitBatch): boolean {
  if (!batch.active) {
    return false;
  }

  batch.active = false;
  currentLifecycleCommitBatch = batch.parent;
  return true;
}

function enqueueLifecycleCommit(
  batch: LifecycleCommitBatch,
  instance: ComponentInstance,
  wasFirstMount: boolean
): void {
  const existing = batch.entriesByInstance.get(instance);
  if (existing) {
    existing.wasFirstMount = existing.wasFirstMount || wasFirstMount;
    return;
  }

  const entry = { instance, wasFirstMount };
  batch.entriesByInstance.set(instance, entry);
  batch.entries.push(entry);
}

function enqueueReadSubscriptionCommit(
  batch: LifecycleCommitBatch,
  instance: ComponentInstance,
  token: number,
  pendingReadSources: Set<ReadableSource<unknown>> | undefined,
  pendingReadSourceVersions: Map<ReadableSource<unknown>, number> | undefined
): void {
  const existing = batch.readCommitsByInstance.get(instance);
  const commit = existing ?? {
    instance,
    token,
    pendingReadSources,
    pendingReadSourceVersions,
  };

  commit.token = token;
  commit.pendingReadSources = pendingReadSources
    ? new Set(pendingReadSources)
    : undefined;
  commit.pendingReadSourceVersions = pendingReadSourceVersions
    ? new Map(pendingReadSourceVersions)
    : undefined;

  if (!existing) {
    batch.readCommitsByInstance.set(instance, commit);
    batch.readCommits.push(commit);
  }
}

function enqueueInlineRenderSnapshot(
  batch: LifecycleCommitBatch,
  snapshot: InlineRenderSnapshot
): void {
  if (batch.renderSnapshotsByInstance.has(snapshot.instance)) {
    return;
  }

  batch.renderSnapshotsByInstance.set(snapshot.instance, snapshot);
  batch.renderSnapshots.push(snapshot);
}

export function captureInlineRenderSnapshot(instance: ComponentInstance): void {
  if (!currentLifecycleCommitBatch?.active) {
    return;
  }

  enqueueInlineRenderSnapshot(currentLifecycleCommitBatch, {
    instance,
    props: instance.props,
    ownerFrame: instance.ownerFrame,
    portalScope: instance.portalScope,
    parentInstance: instance.parentInstance,
    isRoot: instance.isRoot,
  });
}

function finalizeInlineReadSubscriptions(
  instance: ComponentInstance,
  token: number,
  pendingReadSources: Set<ReadableSource<unknown>> | undefined,
  pendingReadSourceVersions: Map<ReadableSource<unknown>, number> | undefined
): void {
  if (currentLifecycleCommitBatch?.active) {
    enqueueReadSubscriptionCommit(
      currentLifecycleCommitBatch,
      instance,
      token,
      pendingReadSources,
      pendingReadSourceVersions
    );
    return;
  }

  finalizeReadableSubscriptionsFromSnapshot(
    instance,
    token,
    pendingReadSources,
    pendingReadSourceVersions
  );
}

function flushLifecycleCommitBatch(batch: LifecycleCommitBatch): void {
  if (!closeLifecycleCommitBatch(batch)) {
    return;
  }

  if (batch.parent?.active) {
    for (const snapshot of batch.renderSnapshots) {
      enqueueInlineRenderSnapshot(batch.parent, snapshot);
    }
    for (const commit of batch.readCommits) {
      enqueueReadSubscriptionCommit(
        batch.parent,
        commit.instance,
        commit.token,
        commit.pendingReadSources,
        commit.pendingReadSourceVersions
      );
    }
    for (const entry of batch.entries) {
      enqueueLifecycleCommit(batch.parent, entry.instance, entry.wasFirstMount);
    }
    return;
  }

  for (const commit of batch.readCommits) {
    finalizeReadableSubscriptionsFromSnapshot(
      commit.instance,
      commit.token,
      commit.pendingReadSources,
      commit.pendingReadSourceVersions
    );
  }

  for (const entry of batch.entries) {
    executeCommittedLifecycleOperations(entry.instance, entry.wasFirstMount);
  }
}

function discardLifecycleCommitBatch(batch: LifecycleCommitBatch): void {
  if (!closeLifecycleCommitBatch(batch)) {
    return;
  }

  for (let index = batch.renderSnapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = batch.renderSnapshots[index]!;
    snapshot.instance.props = snapshot.props;
    snapshot.instance.ownerFrame = snapshot.ownerFrame;
    snapshot.instance.portalScope = snapshot.portalScope;
    snapshot.instance.parentInstance = snapshot.parentInstance;
    snapshot.instance.isRoot = snapshot.isRoot;
  }

  for (const entry of batch.entries) {
    if (entry.wasFirstMount) {
      entry.instance.mountOperations = [];
    }
    discardCommitOperations(entry.instance);
  }
}

export function registerMountOperation(operation: LifecycleOperation): void {
  const instance = getCurrentComponentInstance();
  if (instance) {
    // If we're in bulk-commit fast lane, registering mount operations is a
    // violation of the fast-lane preconditions. Throw in dev, otherwise ignore
    // silently in production (we must avoid scheduling work during bulk commit).
    if (isBulkCommitActive()) {
      if (isDevelopmentEnvironment()) {
        throw new Error(
          'registerMountOperation called during bulk commit fast-lane'
        );
      }
      return;
    }
    instance.mountOperations.push(operation);
  }
}

export function registerCommitOperation(operation: LifecycleOperation): void {
  const instance = getCurrentComponentInstance();
  if (instance) {
    if (isBulkCommitActive()) {
      if (isDevelopmentEnvironment()) {
        throw new Error(
          'registerCommitOperation called during bulk commit fast-lane'
        );
      }
      return;
    }
    instance.commitOperations.push(operation);
  }
}

function settleLifecycleOperationResult(
  instance: ComponentInstance,
  lifecycleGeneration: number,
  result: void | (() => void) | PromiseLike<void | (() => void)>
): void {
  if (isPromiseLike(result)) {
    Promise.resolve(result).then(
      (cleanup) => {
        if (typeof cleanup === 'function') {
          if (
            instance.lifecycleGeneration === lifecycleGeneration &&
            instance.mounted
          ) {
            instance.cleanupFns.push(cleanup);
            return;
          }

          try {
            cleanup();
          } catch (err) {
            logger.error('[Askr] async mount cleanup failed:', err);
          }
        }
      },
      (err) => {
        logger.error('[Askr] async mount operation failed:', err);
      }
    );
  } else if (typeof result === 'function') {
    instance.cleanupFns.push(result);
  }
}

/**
 * Execute all mount operations for a component
 * These run after the component is rendered and mounted to the DOM
 */
function executeMountOperations(instance: ComponentInstance): void {
  const mountOperations = instance.mountOperations;
  if (mountOperations.length === 0) {
    return;
  }

  const lifecycleGeneration = instance.lifecycleGeneration;

  for (const operation of mountOperations) {
    settleLifecycleOperationResult(instance, lifecycleGeneration, operation());
  }
  // Clear the operations array so they don't run again on subsequent renders
  instance.mountOperations = [];
}

function executeCommitOperations(instance: ComponentInstance): void {
  const commitOperations = instance.commitOperations;
  if (commitOperations.length === 0) {
    return;
  }

  instance.commitOperations = [];
  const lifecycleGeneration = instance.lifecycleGeneration;

  for (const operation of commitOperations) {
    settleLifecycleOperationResult(instance, lifecycleGeneration, operation());
  }
}

function discardCommitOperations(instance: ComponentInstance): void {
  instance.commitOperations = [];
}

function executeCommittedLifecycleOperations(
  instance: ComponentInstance,
  wasFirstMount: boolean
): void {
  if (wasFirstMount && instance.mountOperations.length > 0) {
    executeMountOperations(instance);
  }
  if (instance.commitOperations.length > 0) {
    executeCommitOperations(instance);
  }
}

function commitLifecycleForInstance(
  instance: ComponentInstance,
  wasFirstMount: boolean
): void {
  if (currentLifecycleCommitBatch) {
    enqueueLifecycleCommit(
      currentLifecycleCommitBatch,
      instance,
      wasFirstMount
    );
    return;
  }

  executeCommittedLifecycleOperations(instance, wasFirstMount);
}

export function commitRenderedComponent(instance: ComponentInstance): void {
  if (instance.mounted && instance.commitOperations.length > 0) {
    commitLifecycleForInstance(instance, false);
  }
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
let _globalRenderCounter = 0;

function resetRenderState(instance: ComponentInstance): void {
  instance.stateIndexCheck = -1;

  for (const state of instance.stateValues) {
    if (state) {
      state._hasBeenRead = false;
    }
  }

  instance._pendingReadSources = undefined;
  instance._pendingReadSourceVersions = undefined;
}

function nextRenderToken(): number {
  return ++_globalRenderCounter;
}

export function renderScopedComponent<T>(
  instance: ComponentInstance,
  startStateIndex: number,
  render: () => T
): T {
  const savedInstance = currentInstance;
  const savedPortalScope = currentPortalScope;
  const savedStateIndex = stateIndex;

  instance.notifyUpdate = instance._enqueueRun!;
  resetRenderState(instance);
  instance._currentRenderToken = nextRenderToken();

  currentInstance = instance;
  currentPortalScope = instance.portalScope ?? savedPortalScope;
  stateIndex = startStateIndex;

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
      instance._pendingReadSources = undefined;
      instance._pendingReadSourceVersions = undefined;
      instance._currentRenderToken = undefined;
    }
    currentInstance = savedInstance;
    currentPortalScope = savedPortalScope;
    stateIndex = savedStateIndex;
  }
}

function runComponent(instance: ComponentInstance): void {
  // CRITICAL: Ensure notifyUpdate is available for state.set() calls during this render.
  // This must be set before executeComponentSync() runs, not after.
  // Use prebound enqueue helper to avoid allocating per-render closures
  instance.notifyUpdate = instance._enqueueRun!;

  // Assign a token for this in-progress render and start a fresh pending-read set
  instance._currentRenderToken = nextRenderToken();
  instance._pendingReadSources = undefined;
  const domSnapshot = instance.target ? instance.target.innerHTML : '';

  let result: unknown | Promise<unknown>;
  try {
    result = executeComponentSync(instance);
  } catch (err) {
    discardCommitOperations(instance);
    throw err;
  }
  if (isPromiseLike(result)) {
    // Async components are not supported. Components must be synchronous and
    // must not return a Promise from their render function.
    throw new Error(
      'Async components are not supported. Components must be synchronous.'
    );
  } else {
    // Try runtime fast-lane synchronously; if it activates we do not enqueue
    // follow-up work and the commit happens atomically in this task.
    // (Runtime fast-lane has conservative preconditions.)
    try {
      const used = tryRuntimeFastLaneSync(instance, result);
      if (used) {
        warnUnusedStateReads(instance);
        return;
      }
    } catch (err) {
      // If invariant check failed in dev, surface the error; otherwise fall back
      if (isDevelopmentEnvironment()) throw err;
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
          warnUnusedStateReads(instance);
          commitRenderedComponent(instance);
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
        const renderer = getDefaultRuntime().renderer;
        const executionFrame: ContextFrame = {
          parent: instance.ownerFrame,
          values: null,
        };

        // Set up instance for normal updates
        const oldInstance = currentInstance;
        currentInstance = instance;
        const lifecycleBatch = beginLifecycleCommitBatch();
        try {
          try {
            withContext(executionFrame, () => {
              renderer.evaluate(result, host);
            });

            // Replace placeholder with host
            parent.replaceChild(host, placeholder);
          } catch (err) {
            discardLifecycleCommitBatch(lifecycleBatch);
            throw err;
          }

          // Set up instance for future updates
          instance.target = host;
          instance._placeholder = undefined;
          (
            host as Element & { __ASKR_INSTANCE?: ComponentInstance }
          ).__ASKR_INSTANCE = instance;

          flushLifecycleCommitBatch(lifecycleBatch);
          finalizeReadSubscriptions(instance);
          warnUnusedStateReads(instance);
          commitRenderedComponent(instance);
        } finally {
          currentInstance = oldInstance;
        }
        return;
      }

      if (instance.target) {
        const renderer = getDefaultRuntime().renderer;
        let oldChildren: Node[] = [];
        let restoredOldChildren = false;
        try {
          const wasFirstMount = !instance.mounted;
          // Ensure nested component executions during evaluation have access to
          // the current component instance. This allows nested components to
          // call `state()`, `resource()`, and other runtime helpers which
          // rely on `getCurrentComponentInstance()` being available.
          const oldInstance = currentInstance;
          currentInstance = instance;
          const executionFrame: ContextFrame = {
            parent: instance.ownerFrame,
            values: null,
          };
          // Capture snapshot of current children (by reference) so we can
          // restore them on render failure without losing event listeners or
          // instance attachments.
          oldChildren = Array.from(instance.target.childNodes);

          const lifecycleBatch = beginLifecycleCommitBatch();
          try {
            try {
              withContext(executionFrame, () => {
                renderer.evaluate(result, instance.target, undefined, instance);
              });
            } catch (e) {
              discardLifecycleCommitBatch(lifecycleBatch);
              throw e;
            }
          } catch (e) {
            // If evaluation failed, attempt to cleanup any partially-added nodes
            // and restore the old children to preserve listeners and instances.
            try {
              const newChildren = Array.from(instance.target.childNodes);
              const preservedChildren = new Set(oldChildren);
              for (const n of newChildren) {
                if (preservedChildren.has(n)) {
                  continue;
                }
                try {
                  renderer.cleanupInstancesUnder(n);
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
              incDevCounter('__DOM_REPLACE_COUNT');
              setDevValue(
                '__LAST_DOM_REPLACE_STACK_COMPONENT_RESTORE',
                new Error().stack
              );
            } catch (e) {
              void e;
            }
            instance.target.replaceChildren(...oldChildren);
            restoredOldChildren = true;
            throw e;
          } finally {
            currentInstance = oldInstance;
          }

          flushLifecycleCommitBatch(lifecycleBatch);

          // Commit succeeded — finalize recorded state reads so subscriptions reflect
          // the last *committed* render. This updates per-state reader maps
          // deterministically and synchronously with the commit.
          finalizeReadSubscriptions(instance);
          warnUnusedStateReads(instance);

          instance.mounted = true;
          // Execute mount operations after first mount (do NOT run these with
          // currentInstance set - they may perform state mutations/registrations)
          executeCommittedLifecycleOperations(instance, wasFirstMount);
        } catch (renderError) {
          discardCommitOperations(instance);
          // Atomic rendering: rollback on render error. Attempt non-lossy restore of
          // original child node references to preserve listeners/instances.
          try {
            const currentChildren = Array.from(instance.target.childNodes);
            const preservedChildren = restoredOldChildren
              ? new Set(oldChildren)
              : null;
            for (const n of currentChildren) {
              if (preservedChildren?.has(n)) {
                continue;
              }
              try {
                renderer.cleanupInstancesUnder(n);
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
            incDevCounter('__DOM_REPLACE_COUNT');
            setDevValue(
              '__LAST_DOM_REPLACE_STACK_COMPONENT_ROLLBACK',
              new Error().stack
            );
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
  // Reused inline instances can cross renderer cleanup boundaries while their
  // host node is retained. Make sure state writes still enqueue this instance.
  instance.notifyUpdate = instance._enqueueRun!;

  // Ensure inline executions (rendered during parent's evaluate) still
  // receive a render token and have their state reads finalized so
  // subscriptions are correctly recorded. If this function is called
  // as part of a scheduled run, the token will already be set by
  // runComponent and we should not overwrite it.
  const hadToken = instance._currentRenderToken !== undefined;
  const prevToken = instance._currentRenderToken;
  const prevPendingReads = instance._pendingReadSources;
  const prevPendingReadVersions = instance._pendingReadSourceVersions;
  const savedInstance = currentInstance;
  const savedPortalScope = currentPortalScope;

  if (!hadToken) {
    instance._currentRenderToken = nextRenderToken();
    instance._pendingReadSources = undefined;
    instance._pendingReadSourceVersions = undefined;
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
    instance._currentRenderToken = prevToken;
    instance._pendingReadSources = prevPendingReads;
    instance._pendingReadSourceVersions = prevPendingReadVersions;
    currentInstance = savedInstance;
    currentPortalScope = savedPortalScope;
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

  const savedPortalScope = currentPortalScope;
  currentInstance = instance;
  currentPortalScope = instance.portalScope ?? savedPortalScope;
  stateIndex = 0;

  let didComplete = false;

  try {
    // Track render time in dev mode
    const renderStartTime = isDevelopmentEnvironment() ? Date.now() : 0;

    // Create context object with abort signal
    const context = {
      get signal(): AbortSignal {
        return ensureAbortController(instance).signal;
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
    currentInstance = null;
    currentPortalScope = savedPortalScope;
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
  globalScheduler.enqueue(instance._pendingRunTask!);
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
  return ensureAbortController(currentInstance).signal;
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

export function getNextStateIndex(): number {
  return stateIndex++;
}

export function claimHookIndex(
  instance: ComponentInstance,
  hookName: string
): number {
  const index = getNextStateIndex();

  if (index < instance.stateIndexCheck) {
    throw new Error(
      `Hook index violation: ${hookName}() call at index ${index}, ` +
        `but previously saw index ${instance.stateIndexCheck}. ` +
        `This happens when render-scoped hooks are called conditionally (inside if/for/etc). ` +
        `Move all ${hookName}() calls to the top level of your component function, ` +
        `before any conditionals.`
    );
  }

  instance.stateIndexCheck = index;

  if (instance.firstRenderComplete) {
    if (instance.expectedStateIndices[index] !== index) {
      throw new Error(
        `Hook order violation: ${hookName}() called at index ${index}, ` +
          `but this index was not in the first render's sequence [${instance.expectedStateIndices.join(', ')}]. ` +
          `This usually means ${hookName}() is inside a conditional or loop. ` +
          `Move all render-scoped hooks to the top level of your component function.`
      );
    }
  } else {
    instance.expectedStateIndices.push(index);
  }

  return index;
}

export function getCurrentStateIndex(): number {
  return stateIndex;
}

export function resetStateIndex(): void {
  stateIndex = 0;
}

export function setStateIndex(value: number): void {
  stateIndex = value;
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
  const savedInstance = currentInstance;
  const savedPortalScope = currentPortalScope;
  currentInstance = null;
  currentPortalScope = null;

  try {
    const cleanupErrors: unknown[] = [];
    const recordCleanupError = (message: string, err: unknown): void => {
      if (instance.cleanupStrict) {
        cleanupErrors.push(err);
      } else if (isDevelopmentEnvironment()) {
        logger.warn(message, err);
      }
    };

    const ownedChildScopes = instance._ownedChildScopes;
    if (ownedChildScopes && ownedChildScopes.size > 0) {
      instance._ownedChildScopes = new Set();
      for (const scope of ownedChildScopes) {
        try {
          scope.dispose();
        } catch (err) {
          recordCleanupError('[Askr] child scope cleanup threw:', err);
        }
      }
    }

    // Execute cleanup functions (from mount effects)
    const cleanupFns = instance.cleanupFns;
    instance.cleanupFns = [];
    for (const cleanup of cleanupFns) {
      try {
        cleanup();
      } catch (err) {
        recordCleanupError('[Askr] cleanup function threw:', err);
      }
    }

    // Remove deterministic state subscriptions for this instance
    try {
      cleanupReadableSubscriptions(instance);
    } catch (err) {
      recordCleanupError('[Askr] readable subscription cleanup threw:', err);
    }

    // Abort all pending operations
    try {
      if (
        instance.abortController &&
        !instance.abortController.signal.aborted
      ) {
        instance.abortController.abort();
      }
    } catch (err) {
      recordCleanupError('[Askr] abort controller cleanup threw:', err);
    }
    instance.abortController = null;

    // Clear update callback to prevent dangling references and stale updates
    instance.lifecycleGeneration++;
    instance.evaluationGeneration++;
    instance.mountOperations = [];
    instance.commitOperations = [];
    instance.lifecycleSlots = [];
    instance.hasPendingUpdate = false;
    instance.notifyUpdate = null;
    instance._placeholder = undefined;

    // Mark instance as unmounted so external tracking (e.g., portal host lists)
    // can deterministically prune stale instances. Not marking this leads to
    // retained "mounted" flags across cleanup boundaries which breaks
    // owner selection in the portal fallback.
    instance.mounted = false;

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        `Cleanup failed for component ${instance.id}`
      );
    }
  } finally {
    currentInstance = savedInstance;
    currentPortalScope = savedPortalScope;
  }
}

export function registerOwnedChildScope(
  instance: ComponentInstance,
  scope: OwnedChildScope
): void {
  const scopes = (instance._ownedChildScopes ??= new Set());
  scopes.add(scope);
}

export function unregisterOwnedChildScope(
  instance: ComponentInstance,
  scope: OwnedChildScope
): void {
  instance._ownedChildScopes?.delete(scope);
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
