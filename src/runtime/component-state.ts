import type { State } from './state';
import type { Props } from '../common/props';
import type { ComponentFunction } from '../common/component';
import type { ContextFrame } from './context';
import type { ReadableSource } from './readable';
import type { OwnershipRecord } from './ownership';
import type { AppRenderRuntime } from '../common/app-render-runtime';
import type { DOMRange } from '../common/dom-range';
import type { ComponentInstance } from './component-internal';

/** Views share the flat execution record; no wrapper objects or new identities. */
export interface ComponentHooks {
  stateValues?: State<unknown>[];
  // Batches run requests and enqueues _pendingRunTask
  stateIndexCheck: number;
  // Track state indices to catch conditional calls
  expectedStateIndices?: number[];
  // Expected sequence of render-scoped hook indices (frozen after first render)
  firstRenderComplete: boolean;
  // Flag to detect transition from first to subsequent renders
  mountOperations?: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >;
  // Operations to run when component mounts
  commitOperations?: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >;
  // Operations to run after a successful committed render
  lifecycleSlots?: unknown[];
  // Render-scoped lifecycle primitive storage
  lifecycleGeneration: number;
}
export interface ComponentVNodeIdentity {
  // Renderer ownership identity. A host can contain a retained wrapper chain,
  // so component type alone is not a safe reuse key.
  _vnodeOwner?: object;

  _vnodeParent?: ComponentInstance | null;

  _vnodeParentGeneration?: object;

  _vnodeKey?: string | number;

  _vnodePosition?: number;

  _wrapperDepth?: number;
}
export interface ComponentReads {
  // Render-tracking for precise subscriptions (internal)
  _currentRenderToken?: number;
  // Token for the in-progress render (set before render)
  lastRenderToken?: number;
  // Token of the last *committed* render
  _pendingReadSources?: Set<ReadableSource<unknown>>;
  // Readables read during the in-progress render
  _pendingReadSourceVersions?: Map<ReadableSource<unknown>, number>;
}
export interface ComponentDiagnostics {
  id: string;
  // Source versions captured during the in-progress render
  devWarningsEmitted?: Set<string>;
}
export interface ComponentExecution {
  fn: ComponentFunction;

  props: Props;

  target: Element | null;

  /** Renderer-maintained index of this execution record's current host. */
  range?: DOMRange;

  parentInstance: ComponentInstance | null;

  portalScope: object | null;

  owner: OwnershipRecord;

  ssr?: boolean;
  // Set to true for SSR temporary instances
  // Opt-in strict cleanup mode: when true cleanup errors are aggregated and re-thrown
  cleanupStrict?: boolean;
  // Persistent state storage across renders
  evaluationGeneration: number;
  // Prevents stale async evaluation completions
  renderRevision: number;
  // Invalidates prepared output after a newer execution
  notifyUpdate: (() => void) | null;
  // Callback for state updates (persisted on instance)
  // Internal: prebound helpers to avoid per-update closures (allocation hot-path)
  _pendingFlushTask?: () => void;
  // Clears hasPendingUpdate and triggers notifyUpdate
  _pendingRunTask?: () => void;
  // Clears hasPendingUpdate and runs component
  _enqueueRun?: () => void;
  // Invalidates async mount-operation settlement after disposal
  hasPendingUpdate: boolean;
  // Flag to batch state updates (coalescing)
  ownerFrame: ContextFrame | null;
  // Provider chain for this component (set by Scope, never overwritten)
  isRoot?: boolean;

  _rootComponentFn?: ComponentFunction;

  /** @internal Browser-owned hydration and route state for this app root. */
  _appRenderRuntime?: AppRenderRuntime;

  /** @internal CSP nonce retained across browser route navigation. */
  _cspNonce?: string;
  // Dev-only warning dedupe for this instance

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
/** Capture generation state without rewinding the monotonic render revision. */
export function captureGenerationExecution(instance: ComponentInstance) {
  return {
    owner: instance.owner,
    fn: instance.fn,
    props: instance.props,
    expectedStateIndices: instance.expectedStateIndices,
    firstRenderComplete: instance.firstRenderComplete,
    stateIndexCheck: instance.stateIndexCheck,
    errorBoundaryState: instance.errorBoundaryState,
    target: instance.target,
    stateValues: instance.stateValues,
    mountOperations: instance.mountOperations,
    commitOperations: instance.commitOperations,
    lifecycleSlots: instance.lifecycleSlots,
    lifecycleGeneration: instance.lifecycleGeneration,
    evaluationGeneration: instance.evaluationGeneration,
    hasPendingUpdate: instance.hasPendingUpdate,
    notifyUpdate: instance.notifyUpdate,
    _placeholder: instance._placeholder,
    _currentRenderToken: instance._currentRenderToken,
    lastRenderToken: instance.lastRenderToken,
    _pendingReadSources: instance._pendingReadSources,
    _pendingReadSourceVersions: instance._pendingReadSourceVersions,
    _appRenderRuntime: instance._appRenderRuntime,
  };
}

/** Inline execution capture excludes monotonic revision and subscription identity. */
export function captureInlineExecution(instance: ComponentInstance) {
  return {
    props: instance.props,
    firstRenderComplete: instance.firstRenderComplete,
    ownerFrame: instance.ownerFrame,
    portalScope: instance.portalScope,
    isRoot: instance.isRoot,
    _vnodeParentGeneration: instance._vnodeParentGeneration,
    _vnodeOwner: instance._vnodeOwner,
    _vnodeParent: instance._vnodeParent,
    _vnodeKey: instance._vnodeKey,
    _vnodePosition: instance._vnodePosition,
    _wrapperDepth: instance._wrapperDepth,
    cleanupStrict: instance.cleanupStrict,
  };
}

export function restoreInlineExecution(
  instance: ComponentInstance,
  execution: ReturnType<typeof captureInlineExecution>,
  hasVNodeKey: boolean
): void {
  Object.assign(instance, execution);
  if (!hasVNodeKey) delete instance._vnodeKey;
}
