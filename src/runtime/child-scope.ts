import type { VNode } from '../common/vnode';
import { _isDOMElement } from '../common/vnode';
import {
  cleanupComponent,
  createComponentInstance,
  getCurrentInstance,
  getCurrentStateIndex,
  registerOwnedChildScope,
  renderScopedComponent,
  unregisterOwnedChildScope,
  type ComponentInstance,
} from './component';
import { finalizeInlineReadSubscriptions } from './component-lifecycle';
import { clearRenderTracking } from './component-scope';
import { isDevelopmentEnvironment } from '../common/env';
import type { DOMRange } from '../common/dom-range';

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
  dom: Node | undefined;
  range: DOMRange | undefined;
  domTextData: string | undefined;
  needsDomUpdate: boolean;
  hydrationPending: boolean;
  renderFn: (() => VNode) | undefined;
}

interface MutableChildScope extends ChildScope {
  _startStateIndex: number;
  _renderFn?: (() => VNode) | undefined;
  _onDirty?: (() => void) | undefined;
  _parent?: ComponentInstance | null;
  _disposed: boolean;
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
    if (instance.notifyUpdate === null || scope._disposed) {
      return;
    }
    renderScope(scope);
    scope._onDirty?.();
  };
}

class ChildScopeImpl implements MutableChildScope {
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
  _parent: ComponentInstance | null;
  _ownership?: ChildScopeOwnership;
  _disposed = false;

  constructor(
    parent: ComponentInstance | null,
    key: string | number,
    onDirty?: () => void,
    ownership?: ChildScopeOwnership
  ) {
    this.key = key;
    this._parent = parent;
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

    if (parent) {
      this.componentInstance.parentInstance = parent;
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
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    if (this._parent) {
      if (this._ownership) this._ownership.delete(this);
      else unregisterOwnedChildScope(this._parent, this);
    }
    childScopesByInstance.delete(this.componentInstance);
    cleanupComponent(this.componentInstance);
    this._renderFn = undefined;
    this.previousVnode = undefined;
    this.vnode = undefined;
    this.dom = undefined;
    this.range = undefined;
    this.needsDomUpdate = false;
    this.hydrationPending = false;
    this.blueprintOwner = undefined;
    this.componentInstance.hasPendingUpdate = false;
  }
}

function renderScope(scope: MutableChildScope): VNode | undefined {
  if (scope._disposed) {
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

  const { componentInstance } = scope;
  const previousVNode = scope.vnode;

  try {
    const nextVNode = renderScopedComponent(
      componentInstance,
      scope._startStateIndex,
      scope._renderFn
    );
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

/** @internal */
export function captureChildScopeTransactionSnapshot(
  scope: ChildScope
): ChildScopeTransactionSnapshot {
  const mutableScope = scope as MutableChildScope;
  return {
    previousVnode: scope.previousVnode,
    vnode: scope.vnode,
    dom: scope.dom,
    range: scope.range,
    domTextData:
      scope.dom?.nodeType === 3 ? (scope.dom as Text).data : undefined,
    needsDomUpdate: scope.needsDomUpdate,
    hydrationPending: scope.hydrationPending,
    renderFn: mutableScope._renderFn,
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
  scope.dom = snapshot.dom;
  scope.range = snapshot.range;
  if (snapshot.domTextData !== undefined && snapshot.dom?.nodeType === 3) {
    (snapshot.dom as Text).data = snapshot.domTextData;
  }
  scope.needsDomUpdate = snapshot.needsDomUpdate;
  scope.hydrationPending = snapshot.hydrationPending;
  mutableScope._renderFn = snapshot.renderFn;
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
