import type { State } from '../reactivity/state';
import type { Props } from '../../common/props';
import type { ComponentFunction } from '../../common/component';
import type { ContextFrame } from '../context/context';
import type { ReadableSource } from '../reactivity/readable';
import type { OwnershipRecord } from '../ownership/record';
import type { AppRenderRuntime } from '../../common/app-render-runtime';
import type { DOMRange } from '../../common/dom-range';
import type { ComponentInstance } from './instance';
import type { HookKind } from './scope';

/** Views share the flat execution record; no wrapper objects or new identities. */
export interface ComponentHooks {
  /** Persistent state storage across renders. */
  stateValues?: State<unknown>[];
  /** Highest hook index claimed by the current render, or -1 before any. */
  stateIndexCheck: number;
  /** Hook kind claimed at each slot, frozen after the first render. */
  expectedHookKinds?: HookKind[];
  firstRenderComplete: boolean;
  /** Operations activated when the component mounts. */
  mountOperations?: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >;
  /** Operations activated after a successful committed render. */
  commitOperations?: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >;
  lifecycleSlots?: unknown[];
  /** Invalidates async mount settlement after disposal. */
  lifecycleGeneration: number;
}

/** Component type alone cannot identify a retained wrapper chain. */
export interface ComponentVNodeIdentity {
  _vnodeOwner?: object;
  _vnodeParent?: ComponentInstance | null;
  _vnodeParentGeneration?: object;
  _vnodeKey?: string | number;
  _vnodePosition?: number;
  _wrapperDepth?: number;
}

export interface ComponentReads {
  /** Token for the in-progress render. */
  _currentRenderToken?: number;
  /** Token for the last committed render. */
  lastRenderToken?: number;
  /** Readables and their versions captured during the in-progress render. */
  _pendingReadSources?: Set<ReadableSource<unknown>>;
  _pendingReadSourceVersions?: Map<ReadableSource<unknown>, number>;
}

export interface ComponentDiagnostics {
  id: string;
  /** Development-only warning deduplication. */
  devWarningsEmitted?: Set<string>;
}

export interface ComponentExecution {
  /**
   * @internal Set on the child scope of a function child bound beside
   * elements: asking for the current component during its render aborts the
   * render so the binding can upgrade (see `component/scope`).
   */
  _functionChildFastPath?: boolean;
  /** @internal A `FunctionChild` body: remount when its hook order changes. */
  _remountOnHookOrderChange?: boolean;
  /** @internal Set by a render of such a body whose hook order changed. */
  _hookOrderChanged?: boolean;
  /** @internal Bumped to remount a `FunctionChild`'s body. */
  _functionChildGeneration?: number;
  fn: ComponentFunction;
  props: Props;
  target: Element | null;
  /** Renderer-maintained index of this record's current host. */
  range?: DOMRange;
  parentInstance: ComponentInstance | null;
  portalScope: object | null;
  owner: OwnershipRecord;
  /** True for temporary SSR instances. */
  ssr?: boolean;
  /** Aggregate and rethrow cleanup errors when enabled. */
  cleanupStrict?: boolean;
  /** Prevent stale async evaluation completions. */
  evaluationGeneration: number;
  /** Monotonic revision invalidates previously prepared output. */
  renderRevision: number;
  notifyUpdate: (() => void) | null;
  /** Prebound helpers avoid closures on each update. */
  _pendingFlushTask?: () => void;
  _pendingRunTask?: () => void;
  _enqueueRun?: () => void;
  hasPendingUpdate: boolean;
  /** Provider chain assigned by Scope. */
  ownerFrame: ContextFrame | null;
  isRoot?: boolean;
  _rootComponentFn?: ComponentFunction;
  /** Browser-owned hydration and route state for this app root. */
  _appRenderRuntime?: AppRenderRuntime;
  /** CSP nonce retained across browser route navigation. */
  _cspNonce?: string;
  /** Placeholder for a null-returning component. */
  _placeholder?: Comment;
  errorBoundaryState?: {
    error: unknown | null;
    resetKey: unknown;
    notified: boolean;
  };
  /** Logical error ancestry for content materialized by a portal host. */
  _portalErrorParent?: ComponentInstance | null;
  /** Ownership identity paired with the portal error parent. */
  _portalErrorParentGeneration?: object;
}

/** Capture generation state without rewinding the monotonic render revision. */
export function captureGenerationExecution(instance: ComponentInstance) {
  return {
    owner: instance.owner,
    fn: instance.fn,
    props: instance.props,
    expectedHookKinds: instance.expectedHookKinds,
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
