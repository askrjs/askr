import { registerScopedOwnership, releaseOwnedChild } from './ownership';
import { adoptComponentParent } from './component-capabilities';
import { getRuntimeRenderer } from './access';
import type { ChildScopeHostSnapshot } from './renderer-capabilities';
import type { VNode } from '../common/vnode';
import { _isDOMElement } from '../common/vnode';
import { cleanupComponent, registerOwnedChildScope } from './component-cleanup';
import {
  createComponentInstance,
  renderScopedComponent,
  type ComponentInstance,
} from './component-internal';
import { getCurrentInstance, getCurrentStateIndex } from './component-scope';
import { finalizeInlineReadSubscriptions } from './component-lifecycle';
import { clearRenderTracking } from './component-scope';
import { isDevelopmentEnvironment } from '../common/env';
import { DIRECT_RANGE_OWNER, type DOMRange } from '../common/dom-range';
import { rebaseVNodeTreeWithContextFrame, type ContextFrame } from './context';
import type { OwnershipRecord } from './ownership';
import {
  beginCommitTransaction,
  commitTransaction,
  discardTransaction,
  suspendTransaction,
  applyTransaction,
  getCurrentCommitTransaction,
  registerCommitRollback,
  type CommitTransaction,
} from './transaction-access';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;
const EMPTY_CHILD_SCOPE_PROPS = {};

export interface ChildScope {
  key: string | number;
  componentInstance: ComponentInstance;
  previousVnode: VNode | undefined;
  vnode: VNode | undefined;
  dom?: Node;
  /** @internal Fast singleton node plus an anchor-backed multi-node range. */
  range?: DOMRange;
  needsDomUpdate: boolean;
  hydrationPending: boolean;
  /** @internal Stable owner for validated intrinsic blueprints in list items. */
  blueprintOwner?: object;
  render(renderFn: () => VNode): VNode;
  markDirty(): void;
  dispose(): void;
}

export interface ChildScopeOwnership {
  add(scope: ChildScope): void;
  delete(scope: ChildScope): void;
  bulkDispose(run: () => void): void;
}

/** @internal Snapshot used to restore a child scope after a failed commit. */
export interface ChildScopeTransactionSnapshot {
  previousVnode: VNode | undefined;
  vnode: VNode | undefined;
  host: ChildScopeHostSnapshot | undefined;
  needsDomUpdate: boolean;
  hydrationPending: boolean;
  renderFn: (() => VNode) | undefined;
  renderedOwnerFrame: ContextFrame | null;
}

interface MutableChildScope extends ChildScope {
  _preparedTransaction?: CommitTransaction;
  _startStateIndex: number;
  _renderFn?: (() => VNode) | undefined;
  _onDirty?: (() => void) | undefined;
  _parentOwnership?: OwnershipRecord | null;
  _renderedOwnerFrame: ContextFrame | null;
}

const childScopesByInstance = new WeakMap<
  ComponentInstance,
  MutableChildScope
>();

function executeChildScopeComponent(): VNode {
  const instance = getCurrentInstance();
  const scope = instance ? childScopesByInstance.get(instance) : undefined;
  if (!scope?._renderFn) {
    return null;
  }
  return scope._renderFn();
}

function ensureChildScopeFlushTask(scope: MutableChildScope): void {
  const instance = scope.componentInstance;
  if (instance._pendingFlushTask) {
    return;
  }

  instance._pendingFlushTask = () => {
    instance.hasPendingUpdate = false;
    if (instance.notifyUpdate === null || instance.ownership.disposed) {
      return;
    }
    if (scope._preparedTransaction)
      discardTransaction(scope._preparedTransaction);
    const transaction = beginCommitTransaction();
    scope._preparedTransaction = transaction;
    const snapshot = captureChildScopeTransactionSnapshot(scope);
    registerCommitRollback(() => {
      if (!instance.ownership.disposed)
        restoreChildScopeTransactionSnapshot(scope, snapshot);
    });
    try {
      renderScope(scope);
      suspendTransaction(transaction);
      if (scope._onDirty) scope._onDirty();
      else {
        scope._preparedTransaction = undefined;
        commitTransaction(transaction);
      }
    } catch (error) {
      discardTransaction(transaction);
      scope._preparedTransaction = undefined;
      throw error;
    } finally {
      suspendTransaction(transaction);
    }
  };
}

class ChildScopeImpl implements MutableChildScope {
  _preparedTransaction: CommitTransaction | undefined;
  get [DIRECT_RANGE_OWNER](): true {
    return true;
  }
  key: string | number;
  componentInstance: ComponentInstance;
  previousVnode: VNode | undefined = undefined;
  vnode: VNode | undefined = undefined;
  dom: Node | undefined = undefined;
  range: DOMRange | undefined = undefined;
  needsDomUpdate = true;
  hydrationPending = true;
  blueprintOwner: object | undefined = undefined;
  _startStateIndex: number;
  _renderFn: (() => VNode) | undefined = undefined;
  _onDirty: (() => void) | undefined;
  _parentOwnership: OwnershipRecord | null;
  _ownership?: ChildScopeOwnership;
  _renderedOwnerFrame: ContextFrame | null = null;

  constructor(
    parent: ComponentInstance | null,
    key: string | number,
    onDirty?: () => void,
    ownership?: ChildScopeOwnership
  ) {
    this.key = key;
    this._parentOwnership = parent?.ownership ?? null;
    this._onDirty = onDirty;
    this._ownership = ownership;
    this._startStateIndex = getCurrentStateIndex();
    this.componentInstance = createComponentInstance(
      DEVELOPMENT_BUILD_ENABLED ? `child-scope-${String(key)}` : 'child-scope',
      executeChildScopeComponent,
      EMPTY_CHILD_SCOPE_PROPS,
      null
    );
    childScopesByInstance.set(this.componentInstance, this);
    this.componentInstance.ownership.finalizer = this;
    registerScopedOwnership(this, this.componentInstance.ownership);

    if (parent) {
      adoptComponentParent(this.componentInstance, parent);
      this.componentInstance.ownerFrame = parent.ownerFrame;
      this.componentInstance.portalScope = parent.portalScope;
      if (ownership) ownership.add(this);
      else registerOwnedChildScope(parent, this);
    }
  }

  markDirty(): void {
    this.needsDomUpdate = true;
  }

  render(renderFn: () => VNode): VNode {
    this._renderFn = renderFn;
    return renderScope(this) as VNode;
  }

  dispose(): void {
    cleanupComponent(this.componentInstance);
  }

  release(): void {
    try {
      if (this._preparedTransaction)
        discardTransaction(this._preparedTransaction);
      this._preparedTransaction = undefined;
      if (this._ownership) this._ownership.delete(this);
      else if (this._parentOwnership)
        releaseOwnedChild(this._parentOwnership, this);
    } finally {
      childScopesByInstance.delete(this.componentInstance);
      this._renderFn = undefined;
      this.previousVnode = undefined;
      this.vnode = undefined;
      getRuntimeRenderer().clearChildScopeHost(this);
      this.needsDomUpdate = false;
      this.hydrationPending = false;
      this.blueprintOwner = undefined;
      this.componentInstance.hasPendingUpdate = false;
      this._parentOwnership = null;
      this._onDirty = undefined;
      this._ownership = undefined;
      this._renderedOwnerFrame = null;
    }
  }
}

function renderScope(scope: MutableChildScope): VNode | undefined {
  if (scope.componentInstance.ownership.disposed) {
    if (isDevelopmentEnvironment()) {
      throw new Error(
        `[askr] Attempted to render disposed child scope ${String(scope.key)}.`
      );
    }
    return scope.vnode;
  }

  if (!scope._renderFn) {
    return scope.vnode;
  }

  joinChildScopePreparation(scope);

  const { componentInstance } = scope;
  const previousVNode = scope.vnode;

  try {
    const nextVNode = rebaseVNodeTreeWithContextFrame(
      renderScopedComponent(
        componentInstance,
        scope._startStateIndex,
        scope._renderFn
      ),
      componentInstance.ownerFrame,
      scope._renderedOwnerFrame
    ) as VNode;
    if (
      previousVNode &&
      nextVNode &&
      _isDOMElement(previousVNode) &&
      _isDOMElement(nextVNode) &&
      typeof previousVNode.type === 'function' &&
      previousVNode.type === nextVNode.type &&
      '__instance' in previousVNode &&
      !('__instance' in nextVNode)
    ) {
      (
        nextVNode as VNode & {
          __instance?: ComponentInstance;
        }
      ).__instance = (
        previousVNode as VNode & {
          __instance?: ComponentInstance;
        }
      ).__instance;
    }
    scope.previousVnode = previousVNode;
    scope.vnode = nextVNode;
    scope._renderedOwnerFrame = componentInstance.ownerFrame;
    scope.markDirty();
    if ((componentInstance._pendingReadSources?.size ?? 0) > 0) {
      ensureChildScopeFlushTask(scope);
    }
    finalizeInlineReadSubscriptions(
      componentInstance,
      componentInstance._currentRenderToken!,
      componentInstance._pendingReadSources,
      componentInstance._pendingReadSourceVersions
    );
    clearRenderTracking(componentInstance);
    return scope.vnode;
  } catch (error) {
    componentInstance.hasPendingUpdate = false;
    throw error;
  }
}

export function rerenderChildScope(scope: ChildScope): VNode | undefined {
  return renderScope(scope as MutableChildScope);
}

/** Join prepared reads and scope restoration to the transaction applying its output. */
export function joinChildScopePreparation(scope: ChildScope): void {
  const mutable = scope as MutableChildScope;
  const transaction = mutable._preparedTransaction;
  const current = getCurrentCommitTransaction();
  if (!transaction || !current || transaction === current) return;
  mutable._preparedTransaction = undefined;
  applyTransaction(transaction, () => {});
  commitTransaction(transaction);
}

/** @internal */
export function captureChildScopeTransactionSnapshot(
  scope: ChildScope
): ChildScopeTransactionSnapshot {
  const mutableScope = scope as MutableChildScope;
  return {
    previousVnode: scope.previousVnode,
    vnode: scope.vnode,
    host: getRuntimeRenderer().captureChildScopeHost(scope),
    needsDomUpdate: scope.needsDomUpdate,
    hydrationPending: scope.hydrationPending,
    renderFn: mutableScope._renderFn,
    renderedOwnerFrame: mutableScope._renderedOwnerFrame,
  };
}

/** @internal */
export function restoreChildScopeTransactionSnapshot(
  scope: ChildScope,
  snapshot: ChildScopeTransactionSnapshot
): void {
  const mutableScope = scope as MutableChildScope;
  scope.previousVnode = snapshot.previousVnode;
  scope.vnode = snapshot.vnode;
  snapshot.host?.restore(scope);
  scope.needsDomUpdate = snapshot.needsDomUpdate;
  scope.hydrationPending = snapshot.hydrationPending;
  mutableScope._renderFn = snapshot.renderFn;
  mutableScope._renderedOwnerFrame = snapshot.renderedOwnerFrame;
}

export function disposeChildScope(scope: ChildScope): void {
  scope.dispose();
}

export function createChildScope(
  parent: ComponentInstance | null,
  key: string | number,
  onDirty?: () => void,
  ownership?: ChildScopeOwnership
): ChildScope {
  return new ChildScopeImpl(parent, key, onDirty, ownership);
}
