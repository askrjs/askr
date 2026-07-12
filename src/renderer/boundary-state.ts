import { __FOR_BOUNDARY__ } from '../common/vnode';
import {
  clearCaseDomUpdateState,
  clearForDomUpdateState,
  clearShowDomUpdateState,
  evaluateCaseState,
  evaluateForState,
  evaluateShowState,
  type ControlBoundaryState,
} from '../runtime';
import { _isDOMElement, type DOMElement, type VNode } from './types';

export function evaluateControlBoundaryState(
  controlState: ControlBoundaryState
): VNode[] {
  if (controlState.kind === 'for') return evaluateForState(controlState);
  if (controlState.kind === 'show') return evaluateShowState(controlState);
  return evaluateCaseState(controlState);
}

export function clearControlBoundaryDomUpdateState(
  controlState: ControlBoundaryState
): void {
  if (controlState.kind === 'for') {
    clearForDomUpdateState(controlState);
    return;
  }
  if (controlState.kind === 'show') {
    clearShowDomUpdateState(controlState);
    return;
  }
  clearCaseDomUpdateState(controlState);
}

export function getControlBoundaryState(
  node: DOMElement
): ControlBoundaryState | null {
  return (
    node._controlState ??
    (node._forState as ControlBoundaryState | undefined) ??
    null
  );
}

export function getDirectControlBoundaryVNode(
  children: unknown
): DOMElement | null {
  if (
    !Array.isArray(children) &&
    _isDOMElement(children) &&
    (children as DOMElement).type === __FOR_BOUNDARY__
  ) {
    return children as DOMElement;
  }

  if (
    Array.isArray(children) &&
    children.length === 1 &&
    _isDOMElement(children[0]) &&
    (children[0] as DOMElement).type === __FOR_BOUNDARY__
  ) {
    return children[0] as DOMElement;
  }

  return null;
}

export function getControlBoundaryCommitChildren(
  controlState: ControlBoundaryState
): VNode[] {
  if (controlState.kind === 'for' && controlState._needsSourceReconcile) {
    return evaluateForState(controlState);
  }

  if (controlState.kind !== 'for') {
    const activeVNode = controlState.activeScope?.vnode;
    return activeVNode == null || activeVNode === false ? [] : [activeVNode];
  }

  if (controlState.orderedKeys.length === 0) {
    const fallbackVNode = controlState.fallbackScope?.vnode;
    return fallbackVNode == null || fallbackVNode === false
      ? []
      : [fallbackVNode];
  }

  const childrenVNodes: VNode[] = [];
  for (let index = 0; index < controlState.orderedKeys.length; index += 1) {
    const itemKey = controlState.orderedKeys[index];
    const itemInstance = controlState.items.get(itemKey);
    childrenVNodes.push((itemInstance?.scope.vnode ?? null) as VNode);
  }

  return childrenVNodes;
}
