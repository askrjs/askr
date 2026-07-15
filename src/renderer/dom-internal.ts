import { logger } from '../common/logger';
import { Fragment } from '../jsx/jsx-runtime';
import {
  beginLifecycleCommitBatch,
  discardLifecycleCommitBatch,
  flushLifecycleCommitBatch,
  getCurrentInstance,
  isBenchMetricScopeActive,
  recordBenchCounter,
} from '../runtime';
import { __ERROR_BOUNDARY__, __FOR_BOUNDARY__ } from '../common/vnode';
import {
  applyFormControlProp,
  applyStaticScalarPropsToElement,
  hasMatchingStaticProps,
  materializeFreshKey,
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
  teardownNodeSubtree,
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
import { createElementForNamespace, resolveChildNamespace } from './namespaces';
import {
  applyPropsToElement,
  hasTrackedElementPropBindings,
  syncElementPropBindings,
} from './prop-bindings';
import { syncReactiveScalarChild } from './reactive-children';
import { runRetainedElementUpdate } from './retained-element-rollback';
import { canReuseStaticSubtree } from './static-reuse';
import { tryPatchStableForDirtyItem } from './stable-patch';
import {
  tryAdoptMatchingIntrinsicSubtree,
  withIntrinsicHydrationAdoption,
} from './intrinsic-hydration-adoption';
import {
  beginDeferredHydrationActivation,
  commitDeferredHydrationActivation,
  rememberDeferredHydrationVNode,
  rollbackDeferredHydrationActivation,
} from './hydration-boundaries';
import {
  beginHydrationListenerTransaction,
  commitHydrationListenerTransaction,
  discardHydrationListenerTransaction,
} from './hydration-listener-transaction';
import {
  createComponentResultNodeWithBlueprint,
  createResultNodeWithBlueprint,
} from './intrinsic-blueprint';
import {
  _isDOMElement,
  type DOMElement,
  type JSXComponent,
  type VNode,
} from './types';

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

function cleanupFailedDOMConstruction(root: Node): void {
  const nodes =
    root instanceof DocumentFragment ? Array.from(root.childNodes) : [root];

  for (const node of nodes) {
    try {
      teardownNodeSubtree(node);
    } catch {
      // Preserve the construction failure. Teardown remains best-effort, but
      // every reachable provisional subtree still receives an attempt.
    }
  }
}

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
    try {
      for (const child of node) {
        const dom = createDOMNode(child, parentNamespace);
        if (dom) fragment.appendChild(dom);
      }
      return fragment;
    } catch (error) {
      cleanupFailedDOMConstruction(fragment);
      throw error;
    }
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
        type as JSXComponent,
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

function createComponentResultNode(
  component: import('../runtime').ComponentFunction,
  node: unknown,
  parentNamespace?: string
): Node | null {
  return createComponentResultNodeWithBlueprint(
    component,
    node,
    parentNamespace,
    () => createDOMNode(node, parentNamespace),
    rendererReactiveChildDOMHost
  );
}

function createOwnedResultNodeWithBlueprint(
  owner: object,
  node: unknown,
  parentNamespace?: string
): Node | null {
  return createResultNodeWithBlueprint(
    owner,
    node,
    parentNamespace,
    () => createDOMNode(node, parentNamespace),
    rendererReactiveChildDOMHost
  );
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

  try {
    if (isBenchMetricScopeActive('coldCreate')) {
      recordBenchCounter('domNodesCreated');
    }

    materializeFreshKey(el, node, props);

    const staticCreateFastPath = tryGetStaticCreateFastPathShape(
      props,
      children
    );

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
          for (const child of children) {
            const dom = createDOMNode(child, elementNamespace);
            if (dom) el.appendChild(dom);
          }
        } else if (children.length === 1) {
          const dom = createDOMNode(children[0], elementNamespace);
          if (dom) el.appendChild(dom);
        }
      } else {
        const dom = createDOMNode(children, elementNamespace);
        if (dom) el.appendChild(dom);
      }
    }
    if (el.tagName === 'SELECT' && props.value != null) {
      applyFormControlProp(el, 'value', props.value, type);
    }
    return el;
  } catch (error) {
    cleanupFailedDOMConstruction(el);
    throw error;
  }
}

function createFragmentElement(
  node: DOMElement,
  props: Record<string, unknown>,
  parentNamespace?: string
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const children = props.children ?? node.children;
  try {
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
  } catch (error) {
    cleanupFailedDOMConstruction(fragment);
    throw error;
  }
}

export function updateElementFromVnode(
  el: Element,
  vnode: VNode,
  updateChildren = true,
  forceChildrenUpdate = false
): void {
  if (
    updateChildren &&
    !forceChildrenUpdate &&
    _isDOMElement(vnode) &&
    tryAdoptMatchingIntrinsicSubtree(el, vnode as DOMElement)
  ) {
    return;
  }
  runRetainedElementUpdate(el, teardownNodeSubtree, () => {
    applyElementUpdateFromVnode(el, vnode, updateChildren, forceChildrenUpdate);
  });
}

function applyElementUpdateFromVnode(
  el: Element,
  vnode: VNode,
  updateChildren: boolean,
  forceChildrenUpdate: boolean
): void {
  if (!_isDOMElement(vnode)) {
    return;
  }

  const props = (vnode.props || {}) as Record<string, unknown>;
  const domVNode = vnode as DOMElement;

  if (isHydrationSkipped(el)) {
    rememberDeferredHydrationVNode(
      el,
      vnode,
      getCurrentInstance(),
      getCurrentInstance()?.ownerFrame ?? null
    );
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
    if (el.tagName === 'SELECT' && props.value != null) {
      applyFormControlProp(el, 'value', props.value, vnode.type as string);
    }
  }
}

/** @internal Activate one recorded deferred hydration boundary in place. */
export function activateHydrationBoundary(element: Element): boolean {
  const record = beginDeferredHydrationActivation(element);
  if (!record?.vnode) {
    return false;
  }

  const lifecycleBatch = beginLifecycleCommitBatch();
  const listenerTransaction = beginHydrationListenerTransaction();
  try {
    element.removeAttribute('data-skip-hydrate');
    withIntrinsicHydrationAdoption(() => {
      updateElementFromVnode(element, record.vnode!, true, true);
    });
    commitHydrationListenerTransaction(listenerTransaction);
    flushLifecycleCommitBatch(lifecycleBatch);
    commitDeferredHydrationActivation(record);
    return true;
  } catch (error) {
    discardHydrationListenerTransaction(listenerTransaction);
    discardLifecycleCommitBatch(lifecycleBatch);
    element.setAttribute('data-skip-hydrate', 'true');
    rollbackDeferredHydrationActivation(record);
    throw error;
  }
}

configureRendererDOMHost({
  createDOMNode,
  createComponentResultNode,
  syncComponentElement,
  updateElementFromVnode,
  updateElementChildren,
  tryPatchStableForDirtyItem,
});

configureBoundaryDOMHost({
  createDOMNode,
  createResultNodeWithBlueprint: createOwnedResultNodeWithBlueprint,
  syncComponentElement,
  updateElementFromVnode,
  tryPatchStableForDirtyItem,
});
