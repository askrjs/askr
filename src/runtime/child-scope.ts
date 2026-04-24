import type { VNode } from '../common/vnode';
import {
  cleanupComponent,
  createComponentInstance,
  finalizeReadSubscriptions,
  getCurrentInstance,
  getCurrentStateIndex,
  setCurrentComponentInstance,
  setStateIndex,
  type ComponentInstance,
} from './component';

export interface ChildScope {
  key: string | number | null;
  componentInstance: ComponentInstance;
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
}

let _childScopeRenderCounter = 1;

function renderScope(scope: MutableChildScope): VNode | undefined {
  if (!scope._renderFn) {
    return scope.vnode;
  }

  const { componentInstance } = scope;
  const savedInstance = getCurrentInstance();
  const savedStateIndex = getCurrentStateIndex();

  setCurrentComponentInstance(componentInstance);
  componentInstance.stateIndexCheck = -1;

  const stateValues = componentInstance.stateValues;
  for (let i = 0; i < stateValues.length; i++) {
    const state = stateValues[i];
    if (state) {
      state._hasBeenRead = false;
    }
  }

  setStateIndex(scope._startStateIndex);
  componentInstance._currentRenderToken = _childScopeRenderCounter++;
  componentInstance._pendingReadSources = undefined;

  try {
    scope.vnode = scope._renderFn();
    scope.markDirty();
    finalizeReadSubscriptions(componentInstance);
    return scope.vnode;
  } finally {
    setStateIndex(savedStateIndex);
    setCurrentComponentInstance(savedInstance);
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
  key: string | number | null,
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
  scope.vnode = undefined;
  scope.dom = undefined;
  scope.needsDomUpdate = true;
  scope._startStateIndex = getCurrentStateIndex();
  scope._renderFn = undefined;
  scope._onDirty = onDirty;
  scope.markDirty = () => {
    scope.needsDomUpdate = true;
  };
  scope.render = (renderFn: () => VNode) => {
    scope._renderFn = renderFn;
    return renderScope(scope) as VNode;
  };
  scope.dispose = () => {
    cleanupComponent(componentInstance);
    scope._renderFn = undefined;
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

  return scope;
}
