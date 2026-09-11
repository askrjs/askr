import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
import { State, state } from './state.js';
import { ComponentFunction, ContextFrame, OwnedChildScope } from './context.js';
import { DataRuntime } from './data.js';
import { RouteAuthOptions, RouteRegistry } from './routing.js';

interface AppRenderRuntime {
  framework: Readonly<Record<string, unknown>>;
  route: unknown;
  hasRoute: boolean;
  dataRuntime?: DataRuntime;
  routeRegistry?: RouteRegistry;
  routeAuth?: RouteAuthOptions;
}

interface ComponentInstance {
  id: string;
  fn: ComponentFunction;
  props: Props;
  target: Element | null;
  parentInstance: ComponentInstance | null;
  portalScope: object | null;
  mounted: boolean;
  abortController: AbortController | null;
  ssr?: boolean;
  cleanupStrict?: boolean;
  /** @internal Private resource-ownership identity for the active mount. */
  _ownershipGeneration: object;
  stateValues?: State<unknown>[];
  evaluationGeneration: number;
  notifyUpdate: (() => void) | null;
  _pendingFlushTask?: () => void;
  _pendingRunTask?: () => void;
  _enqueueRun?: () => void;
  stateIndexCheck: number;
  expectedStateIndices?: number[];
  firstRenderComplete: boolean;
  mountOperations?: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >;
  commitOperations?: Array<
    () => void | (() => void) | PromiseLike<void | (() => void)>
  >;
  cleanupFns?: Array<() => void>;
  lifecycleSlots?: unknown[];
  lifecycleGeneration: number;
  hasPendingUpdate: boolean;
  ownerFrame: ContextFrame | null;
  isRoot?: boolean;
  _rootComponentFn?: ComponentFunction;
  /** @internal Browser-owned hydration and route state for this app root. */
  _appRenderRuntime?: AppRenderRuntime;
  /** @internal CSP nonce retained across browser route navigation. */
  _cspNonce?: string;
  _vnodeOwner?: object;
  _vnodeParent?: ComponentInstance | null;
  _vnodeParentGeneration?: object;
  _vnodeKey?: string | number;
  _vnodePosition?: number;
  _wrapperDepth?: number;
  _currentRenderToken?: number;
  lastRenderToken?: number;
  _pendingReadSources?: Set<ReadableSource<unknown>>;
  _pendingReadSourceVersions?: Map<ReadableSource<unknown>, number>;
  _lastReadSources?: Set<ReadableSource<unknown>>;
  devWarningsEmitted?: Set<string>;
  _placeholder?: Comment;
  _ownedChildScopes?: Set<OwnedChildScope>;
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

/**
 * Get the abort signal for the current component.
 *
 * The signal is guaranteed to be aborted when:
 * - Component unmounts
 * - Navigation occurs (different route)
 * - Parent is destroyed
 */
declare function getSignal(): AbortSignal;

interface DerivedSubscriber {
  _markDirty(): void;
  _pendingDependencySources?: Set<ReadableSource<unknown>>;
}

interface ReadableSource<T = unknown> {
  (): T;
  _hasBeenRead?: boolean;
  _hasEverBeenRead?: boolean;
  _unusedStateDiagnosticEligible?: boolean;
  _readers?: Map<
    ComponentInstance,
    {
      token: number;
      generation: object;
    }
  >;
  _derivedSubscribers?: Set<DerivedSubscriber>;
  _version?: number;
}
export {
  AppRenderRuntime,
  ComponentInstance,
  getSignal,
  DerivedSubscriber,
  ReadableSource,
};
