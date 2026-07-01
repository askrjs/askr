import { logger } from '../dev/logger';
import { Fragment } from '../jsx/jsx-runtime';
import { isBenchMetricScopeActive, recordBenchCounter } from '../runtime/for';
import { __ERROR_BOUNDARY__, __FOR_BOUNDARY__ } from '../common/vnode';
import {
  applyStaticScalarPropsToElement,
  hasMatchingStaticProps,
  materializeKey,
} from './attributes';
import {
  configureBoundaryDOMHost,
  createForBoundary,
  getControlBoundaryState,
  getDirectControlBoundaryVNode,
  registerControlBoundaryCommitOwner,
} from './boundaries';
import {
  isBulkTextFastPathEligible,
  performBulkPositionalKeyedTextUpdate,
  performBulkTextReplace,
} from './children';
import {
  maybeWarnMissingKeys,
  tryGetStaticCreateFastPathShape,
} from './child-shape';
import {
  removeAllListeners,
  removeElementReactiveProps,
  updateElementRef,
} from './cleanup';
import { createComponentElement, syncComponentElement } from './component-host';
import { configureRendererDOMHost, type ElementWithContext } from './dom-host';
import {
  rendererReactiveChildDOMHost,
  updateElementChildren,
  updateUnkeyedChildren,
} from './element-children';
import {
  createErrorBoundaryElement,
  type ErrorBoundaryVNode,
} from './error-boundary-dom';
import { getRuntimeEnv } from './env';
import {
  createElementForNamespace,
  resolveChildNamespace,
} from './namespaces';
import {
  applyPropsToElement,
  hasTrackedElementPropBindings,
  syncElementPropBindings,
} from './prop-bindings';
import { syncReactiveScalarChild } from './reactive-children';
import { canReuseStaticSubtree } from './static-reuse';
import { tryPatchStableForDirtyItem } from './stable-patch';
import { _isDOMElement, type DOMElement, type VNode } from './types';

export { createForBoundary, commitForBoundaryChildren } from './boundaries';
export { markReactivePropsDirtySource } from './prop-bindings';
export { setStaticChildSlotsCacheEnabled } from './static-reuse';
export {
  isBulkTextFastPathEligible,
  performBulkPositionalKeyedTextUpdate,
  performBulkTextReplace,
};
export {
  syncComponentElement,
  updateElementChildren,
  updateUnkeyedChildren,
  tryPatchStableForDirtyItem,
};

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

function getHydrationSkipBoundary(el: Element): Element | null {
  return el.closest('[data-skip-hydrate="true"]');
}

function isHydrationSkipped(el: Element): boolean {
  return getHydrationSkipBoundary(el) !== null;
}

function clearHydrationDeferredSubtree(el: Element): void {
  const boundary = getHydrationSkipBoundary(el);
  if (!boundary) return;
  if (boundary === el) {
    removeAllListeners(el);
    removeElementReactiveProps(el);
  }
}

export function createDOMNode(
  node: unknown,
  parentNamespace?: string
): Node | null {
  if (!IS_DOM_AVAILABLE) {
    if (getRuntimeEnv().NODE_ENV !== 'production') {
      try {
        logger.warn('[Askr] createDOMNode called in non-DOM environment');
      } catch {
        // ignore
      }
    }
    return null;
  }

  if (typeof node === 'string') {
    if (isBenchMetricScopeActive('coldCreate')) {
      recordBenchCounter('domNodesCreated');
    }
    return document.createTextNode(node);
  }
  if (typeof node === 'number') {
    if (isBenchMetricScopeActive('coldCreate')) {
      recordBenchCounter('domNodesCreated');
    }
    return document.createTextNode(String(node));
  }

  if (!node) {
    return null;
  }

  if (Array.isArray(node)) {
    maybeWarnMissingKeys(node);
    const fragment = document.createDocumentFragment();
    for (const child of node) {
      const dom = createDOMNode(child, parentNamespace);
      if (dom) fragment.appendChild(dom);
    }
    return fragment;
  }

  if (typeof node === 'object' && node !== null && 'type' in node) {
    const type = (node as DOMElement).type;
    const props = ((node as DOMElement).props || {}) as Record<string, unknown>;

    if (typeof type === 'string') {
      return createIntrinsicElement(
        node as DOMElement,
        type,
        props,
        parentNamespace
      );
    }

    if (typeof type === 'function') {
      return createComponentElement(
        node as ElementWithContext,
        type as (props: never) => unknown,
        props,
        parentNamespace
      );
    }

    if (type === __FOR_BOUNDARY__) {
      return createForBoundary(node as DOMElement, props, parentNamespace);
    }

    if (type === __ERROR_BOUNDARY__) {
      return createErrorBoundaryElement(
        node as ErrorBoundaryVNode,
        props,
        parentNamespace
      );
    }

    if (
      typeof type === 'symbol' &&
      (type === Fragment || String(type) === 'Symbol(Fragment)')
    ) {
      return createFragmentElement(node as DOMElement, props, parentNamespace);
    }
  }

  return null;
}

function createIntrinsicElement(
  node: DOMElement,
  type: string,
  props: Record<string, unknown>,
  parentNamespace?: string
): Element {
  const children = props.children ?? node.children;
  const elementNamespace = resolveChildNamespace(type, parentNamespace);
  const el = createElementForNamespace(type, parentNamespace);

  if (isBenchMetricScopeActive('coldCreate')) {
    recordBenchCounter('domNodesCreated');
  }

  materializeKey(el, node, props);

  const staticCreateFastPath = tryGetStaticCreateFastPathShape(props, children);

  if (staticCreateFastPath) {
    applyStaticScalarPropsToElement(el, props, type);
    if (staticCreateFastPath.textContent !== null) {
      el.textContent = staticCreateFastPath.textContent;
      if (isBenchMetricScopeActive('coldCreate')) {
        recordBenchCounter('domNodesCreated');
      }
    }
    return el;
  }

  applyPropsToElement(el, props, type, isHydrationSkipped);

  if (children !== null && children !== undefined) {
    const controlBoundaryVNode = getDirectControlBoundaryVNode(children);
    if (controlBoundaryVNode) {
      const controlState = getControlBoundaryState(controlBoundaryVNode);
      if (!controlState) {
        throw new Error(
          '[createIntrinsicElement] Control boundary missing internal state'
        );
      }
      registerControlBoundaryCommitOwner(el, controlState);
    }

    if (syncReactiveScalarChild(el, children, rendererReactiveChildDOMHost)) {
      return el;
    }

    if (Array.isArray(children)) {
      maybeWarnMissingKeys(children);
      if (children.length > 1) {
        const childFrag = document.createDocumentFragment();
        for (const child of children) {
          const dom = createDOMNode(child, elementNamespace);
          if (dom) childFrag.appendChild(dom);
        }
        el.appendChild(childFrag);
      } else if (children.length === 1) {
        const dom = createDOMNode(children[0], elementNamespace);
        if (dom) el.appendChild(dom);
      }
    } else {
      const dom = createDOMNode(children, elementNamespace);
      if (dom) el.appendChild(dom);
    }
  }
  return el;
}

function createFragmentElement(
  node: DOMElement,
  props: Record<string, unknown>,
  parentNamespace?: string
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const children = props.children ?? node.children;
  if (children) {
    if (Array.isArray(children)) {
      maybeWarnMissingKeys(children);
      for (const child of children) {
        const dom = createDOMNode(child, parentNamespace);
        if (dom) fragment.appendChild(dom);
      }
    } else {
      const dom = createDOMNode(children, parentNamespace);
      if (dom) fragment.appendChild(dom);
    }
  }
  return fragment;
}

export function updateElementFromVnode(
  el: Element,
  vnode: VNode,
  updateChildren = true,
  forceChildrenUpdate = false
): void {
  if (!_isDOMElement(vnode)) {
    return;
  }

  const props = (vnode.props || {}) as Record<string, unknown>;
  const domVNode = vnode as DOMElement;

  if (isHydrationSkipped(el)) {
    clearHydrationDeferredSubtree(el);
    return;
  }

  materializeKey(el, vnode, props);
  updateElementRef(el, props.ref);

  if (!hasTrackedElementPropBindings(el)) {
    if (
      !forceChildrenUpdate &&
      hasMatchingStaticProps(el, props, vnode.type as string)
    ) {
      if (updateChildren) {
        const children =
          (props.children as VNode | VNode[] | undefined) ?? vnode.children;
        if (!forceChildrenUpdate && canReuseStaticSubtree(el, domVNode)) {
          return;
        }
        updateElementChildren(el, children, forceChildrenUpdate);
      }
      return;
    }
  }

  const nextChildren = props.children ?? domVNode.children;
  const usesReactiveChildren = syncReactiveScalarChild(
    el,
    nextChildren,
    rendererReactiveChildDOMHost
  );
  syncElementPropBindings(el, domVNode, props, usesReactiveChildren);

  if (updateChildren) {
    const children =
      (props.children as VNode | VNode[] | undefined) ?? vnode.children;
    if (usesReactiveChildren) {
      return;
    }
    updateElementChildren(el, children, forceChildrenUpdate);
  }
}

configureRendererDOMHost({
  createDOMNode,
  syncComponentElement,
  updateElementFromVnode,
  updateElementChildren,
  tryPatchStableForDirtyItem,
});

configureBoundaryDOMHost({
  createDOMNode,
  syncComponentElement,
  updateElementFromVnode,
  tryPatchStableForDirtyItem,
});
