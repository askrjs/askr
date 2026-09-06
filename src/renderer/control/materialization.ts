import type { DOMRange } from '../../common/dom-range';
import { logger } from '../../common/logger';
import { getRuntimeEnv } from '../env';
import {
  assignScopeRange,
  checkVNodeShapeChanged,
  materializeChildScopeRange,
} from './range-adoption';
import { appendRange } from '../ownership/ranges';
import {
  clearControlBoundaryDomUpdateState,
  evaluateControlBoundaryState,
  getControlBoundaryState,
} from './state';
import { type DOMElement } from '../types';

/**
 * Create DOM from For/Show/Case control boundaries.
 *
 * DOM order is reconstructed from the current vnode list on every render.
 * Reusing DOM nodes never implies preserving their position; appending an
 * existing node to the fragment expresses reordering per the DOM spec.
 */
export function createForBoundary(
  node: DOMElement,
  props: Record<string, unknown>,
  parentNamespace?: string
): DocumentFragment {
  void props;
  const controlState = getControlBoundaryState(node);

  if (!controlState) {
    if (getRuntimeEnv().NODE_ENV !== 'production') {
      logger.warn('[Askr] Control boundary missing state');
    }
    return document.createDocumentFragment();
  }

  const childrenVNodes = evaluateControlBoundaryState(controlState);
  const fragment = document.createDocumentFragment();

  if (controlState.kind !== 'for') {
    const activeScope = controlState.activeScope;
    const vnode = childrenVNodes[0];
    if (activeScope && vnode !== undefined) {
      const range = materializeChildScopeRange(
        vnode,
        parentNamespace,
        activeScope
      );
      assignScopeRange(activeScope, range);
      activeScope.hydrationPending = false;
      appendRange(fragment, range);
    }
    clearControlBoundaryDomUpdateState(controlState);
    return fragment;
  }

  const forState = controlState;
  if (forState.orderedKeys.length === 0) {
    const fallbackScope = forState.fallbackScope;
    const fallbackVNode = childrenVNodes[0];
    if (fallbackScope && fallbackVNode !== undefined) {
      const range = materializeChildScopeRange(
        fallbackVNode,
        parentNamespace,
        fallbackScope
      );
      assignScopeRange(fallbackScope, range);
      fallbackScope.hydrationPending = false;
      appendRange(fragment, range);
    }
    clearControlBoundaryDomUpdateState(controlState);
    return fragment;
  }

  for (let i = 0; i < childrenVNodes.length; i++) {
    const childVNode = childrenVNodes[i];
    const itemKey = forState.orderedKeys[i];
    const itemInstance = itemKey != null ? forState.items.get(itemKey) : null;

    let range: DOMRange | null = null;

    if (itemInstance && itemInstance.scope.range) {
      const cachedRange = itemInstance.scope.range;
      const cachedDom = cachedRange.single ? cachedRange.start : null;
      if (!cachedDom || !checkVNodeShapeChanged(cachedDom, childVNode)) {
        range = cachedRange;
      }
    }

    if (!range) {
      const materializedRange = materializeChildScopeRange(
        childVNode,
        parentNamespace,
        itemInstance?.scope
      );
      if (itemInstance) {
        assignScopeRange(itemInstance.scope, materializedRange);
        itemInstance.scope.hydrationPending = false;
      }
      range = materializedRange;
    }

    appendRange(fragment, range);
  }

  clearControlBoundaryDomUpdateState(controlState);
  return fragment;
}
