import type { VNode } from '../common/vnode';
import { _isDOMElement } from '../common/vnode';
import {
  cleanupComponent,
  createComponentInstance,
  finalizeReadSubscriptions,
  getCurrentStateIndex,
  registerOwnedChildScope,
  renderScopedComponent,
  unregisterOwnedChildScope,
  type ComponentInstance,
} from './component';
import { isDevelopmentEnvironment } from '../common/env';

export interface ChildScope {
  key: string | number;
  componentInstance: ComponentInstance;
  previousVnode: VNode | undefined;
  vnode: VNode | undefined;
  dom?: Node;
  needsDomUpdate: boolean;
  render(renderFn: () => VNode): VNode;
  markDirty(): void;
  dispose(): void;
}

interface MutableChildScope extends ChildScope {
  _startStateIndex: number;
  _renderFn?: (() => VNode) | undefined;
  _onDirty?: (() => void) | undefined;
  _parent?: ComponentInstance | null;
  _disposed: boolean;
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
    finalizeReadSubscriptions(componentInstance);
    return scope.vnode;
  } catch (error) {
    componentInstance.hasPendingUpdate = false;
    throw error;
  }
}

export function rerenderChildScope(scope: ChildScope): VNode | undefined {
  return renderScope(scope as MutableChildScope);
}

export function disposeChildScope(scope: ChildScope): void {
  scope.dispose();
}

export function createChildScope(
  parent: ComponentInstance | null,
  key: string | number,
  onDirty?: () => void
): ChildScope {
  const scope = {} as MutableChildScope;

  const componentInstance = createComponentInstance(
    `child-scope-${String(key)}`,
    () => scope._renderFn?.() ?? null,
    {},
    null
  );

  if (parent) {
    componentInstance.ownerFrame = parent.ownerFrame;
  }

  scope.key = key;
  scope.componentInstance = componentInstance;
  scope.previousVnode = undefined;
  scope.vnode = undefined;
  scope.dom = undefined;
  scope.needsDomUpdate = true;
  scope._startStateIndex = getCurrentStateIndex();
  scope._renderFn = undefined;
  scope._onDirty = onDirty;
  scope._parent = parent;
  scope._disposed = false;
  scope.markDirty = () => {
    scope.needsDomUpdate = true;
  };
  scope.render = (renderFn: () => VNode) => {
    scope._renderFn = renderFn;
    return renderScope(scope) as VNode;
  };
  scope.dispose = () => {
    if (scope._disposed) {
      return;
    }
    scope._disposed = true;
    if (scope._parent) {
      unregisterOwnedChildScope(scope._parent, scope);
    }
    cleanupComponent(componentInstance);
    scope._renderFn = undefined;
    scope.previousVnode = undefined;
    scope.vnode = undefined;
    scope.dom = undefined;
    scope.needsDomUpdate = false;
    componentInstance.hasPendingUpdate = false;
  };

  componentInstance._pendingFlushTask = () => {
    componentInstance.hasPendingUpdate = false;
    renderScope(scope);
    scope._onDirty?.();
  };

  if (parent) {
    registerOwnedChildScope(parent, scope);
  }

  return scope;
}
