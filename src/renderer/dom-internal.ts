import { logger } from '../dev/logger';
import { isPromiseLike } from '../common/promise';
import { ROUTE_ROOT_COMPONENT } from '../common/router-internal';
import { getRuntimeEnv } from './env';
import type { Props } from '../common/props';
import { Fragment } from '../jsx/jsx-runtime';
import {
  CONTEXT_FRAME_SYMBOL,
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
  withContext,
  getCurrentContextFrame,
  ContextFrame,
} from '../runtime/context';
import {
  createComponentInstance,
  cleanupComponent,
  renderComponentInline,
  mountInstanceInline,
  captureInlineRenderSnapshot,
  getCurrentInstance,
  setCurrentComponentInstance as _setCurrentInstance,
  warnUnusedStateReads,
  type ComponentInstance,
  type ComponentFunction,
} from '../runtime/component-contracts';
import {
  removeAllListeners,
  teardownNodeSubtree,
  removeElementListeners,
  removeElementReactiveProps,
  updateElementRef,
} from './cleanup';
import { incDevCounter, getDevValue } from '../runtime/dev-namespace';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { __FOR_BOUNDARY__, __ERROR_BOUNDARY__ } from '../common/vnode';
import {
  isBenchMetricScopeActive,
  recordBenchCounter,
  recordBenchEvent,
} from '../runtime/for';
import { keyedElements } from './keyed';
import {
  applyStaticScalarPropsToElement,
  hasMatchingStaticProps,
  materializeKey,
} from './attributes';
import {
  canReuseStaticSubtree,
  tagsEqualIgnoreCase,
} from './static-reuse';
import {
  applyPropsToElement,
  hasTrackedElementPropBindings,
  syncElementPropBindings,
} from './prop-bindings';
import {
  createElementForNamespace,
  getParentNamespace,
  resolveChildNamespace,
} from './namespaces';
import {
  clearControlBoundaryCommitOwner,
  commitForBoundaryChildren,
  configureBoundaryDOMHost,
  createForBoundary,
  evaluateControlBoundaryState,
  getControlBoundaryState,
  getDirectControlBoundaryVNode,
  registerControlBoundaryCommitOwner,
  trySyncControlBoundaryChild,
} from './boundaries';
import { tagNamesEqualIgnoreCase, extractKey } from './utils';
import { reconcileKeyedChildren } from './reconcile';
import {
  isBulkTextFastPathEligible,
  performBulkPositionalKeyedTextUpdate,
  performBulkTextReplace,
} from './children';
import {
  createBoundaryReset,
  reportBoundaryError,
  resolveErrorBoundaryFallback,
  type ErrorBoundaryProps,
} from '../components/error-boundary';
import {
  isFragmentVNode,
  maybeWarnMissingKeys,
  normalizeComponentChildren,
  tryGetStaticCreateFastPathShape,
} from './child-shape';
import {
  syncReactiveScalarChild,
  trySyncScalarChildSequenceInPlace,
  type ReactiveChildDOMHost,
} from './reactive-children';

export { createForBoundary, commitForBoundaryChildren } from './boundaries';
export { markReactivePropsDirtySource } from './prop-bindings';
export { setStaticChildSlotsCacheEnabled } from './static-reuse';
export {
  isBulkTextFastPathEligible,
  performBulkPositionalKeyedTextUpdate,
  performBulkTextReplace,
};

type ElementWithContext = DOMElement & {
  [CONTEXT_FRAME_SYMBOL]?: ContextFrame;
  [ROUTE_ROOT_COMPONENT]?: boolean;
  __instance?: ComponentInstance;
};

type InstanceHostElement = Element & {
  __ASKR_INSTANCE?: ComponentInstance;
  __ASKR_INSTANCES?: ComponentInstance[];
  __ASKR_WRAPPER_HOST?: boolean;
};

const reactiveChildDOMHost: ReactiveChildDOMHost = {
  createDOMNode: (node, parentNamespace) =>
    createDOMNode(node, parentNamespace),
  updateElementChildren: (el, children, forceUpdate) =>
    updateElementChildren(el, children, forceUpdate),
};

function isRouteRootComponentVNode(node: unknown): boolean {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { [ROUTE_ROOT_COMPONENT]?: boolean })[ROUTE_ROOT_COMPONENT] ===
      true
  );
}

function inheritComponentCleanupStrict(instance: ComponentInstance): void {
  const owner = getCurrentInstance();
  if (owner) {
    instance.cleanupStrict = owner.cleanupStrict;
  }
}

function cleanupDetachedComponentHost(
  host: InstanceHostElement,
  retainedInstance: ComponentInstance
): void {
  removeElementListeners(host);
  removeElementReactiveProps(host);

  const hostInstances = host.__ASKR_INSTANCES;
  if (hostInstances && hostInstances.length > 0) {
    for (const instance of hostInstances) {
      if (instance === retainedInstance) continue;
      cleanupComponent(instance);
    }
  } else if (
    host.__ASKR_INSTANCE &&
    host.__ASKR_INSTANCE !== retainedInstance
  ) {
    cleanupComponent(host.__ASKR_INSTANCE);
  }

  const descendants = host.querySelectorAll('*');
  for (let index = 0; index < descendants.length; index += 1) {
    const descendant = descendants[index] as InstanceHostElement;
    removeElementListeners(descendant);
    removeElementReactiveProps(descendant);

    if (descendant.__ASKR_INSTANCES?.length) {
      for (const instance of descendant.__ASKR_INSTANCES) {
        if (instance === retainedInstance) continue;
        cleanupComponent(instance);
      }
      try {
        delete descendant.__ASKR_INSTANCES;
      } catch {
        // Ignore host cleanup failures.
      }
    } else if (
      descendant.__ASKR_INSTANCE &&
      descendant.__ASKR_INSTANCE !== retainedInstance
    ) {
      cleanupComponent(descendant.__ASKR_INSTANCE);
      try {
        delete descendant.__ASKR_INSTANCE;
      } catch {
        // Ignore host cleanup failures.
      }
    }
  }

  try {
    delete host.__ASKR_INSTANCE;
    delete host.__ASKR_INSTANCES;
    delete host.__ASKR_WRAPPER_HOST;
  } catch {
    // Ignore host cleanup failures.
  }
}

function pruneComponentHostInstances(
  host: InstanceHostElement,
  retainedInstances: Iterable<ComponentInstance>
): void {
  const retained = new Set(retainedInstances);
  const nextInstances: ComponentInstance[] = [];
  const staleInstances = new Set<ComponentInstance>();

  const retainOrMarkStale = (instance: ComponentInstance | undefined) => {
    if (!instance) {
      return;
    }

    if (retained.has(instance)) {
      if (!nextInstances.includes(instance)) {
        nextInstances.push(instance);
      }
      return;
    }

    staleInstances.add(instance);
  };

  for (const instance of host.__ASKR_INSTANCES ?? []) {
    retainOrMarkStale(instance);
  }
  retainOrMarkStale(host.__ASKR_INSTANCE);

  for (const instance of staleInstances) {
    cleanupComponent(instance);
  }

  try {
    if (nextInstances.length > 0) {
      host.__ASKR_INSTANCES = nextInstances;
      host.__ASKR_INSTANCE = nextInstances[0];
    } else {
      delete host.__ASKR_INSTANCES;
      delete host.__ASKR_INSTANCE;
    }
  } catch {
    // Ignore host metadata cleanup failures.
  }
}

const vnodeComponentInstances = new WeakMap<object, ComponentInstance>();

function getVNodeComponentInstance(
  node: unknown
): ComponentInstance | undefined {
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }

  return (
    vnodeComponentInstances.get(node) ??
    (node as { __instance?: ComponentInstance }).__instance
  );
}

function setVNodeComponentInstance(
  node: unknown,
  instance: ComponentInstance
): void {
  if (typeof node !== 'object' || node === null) {
    return;
  }

  const objectNode = node as { __instance?: ComponentInstance };

  if (Object.prototype.hasOwnProperty.call(objectNode, '__instance')) {
    try {
      objectNode.__instance = instance;
      return;
    } catch {
      // Fall back to WeakMap for readonly vnode metadata.
    }
  }

  if (Object.isExtensible(objectNode)) {
    try {
      objectNode.__instance = instance;
      return;
    } catch {
      // Fall back to WeakMap for frozen/proxied objects.
    }
  }

  vnodeComponentInstances.set(objectNode, instance);
}

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

let fallbackComponentInstanceId = 0;

function nextComponentInstanceId(): string {
  const key = '__COMPONENT_INSTANCE_ID';
  try {
    incDevCounter(key);
    const n = getDevValue<number>(key);
    if (typeof n === 'number' && Number.isFinite(n)) return `comp-${n}`;
  } catch {
    // Fall through to local counter
  }
  fallbackComponentInstanceId++;
  return `comp-${fallbackComponentInstanceId}`;
}

function inheritComponentKey(
  target: DOMElement,
  source: DOMElement
): DOMElement {
  const inheritedKey = extractKey(source);
  if (inheritedKey === undefined || extractKey(target) !== undefined) {
    return target;
  }

  target.key = inheritedKey;

  if (typeof target.type === 'string') {
    if (!target.props) {
      target.props = {};
    }

    const props = target.props as Record<string, unknown>;
    if (props['data-key'] === undefined) {
      props['data-key'] = String(inheritedKey);
    }
  }

  return target;
}

// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼
// Dynamic List Warnings
// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼

// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼
// DOM Node Creation
// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼

/**
 * Create a DOM node from a VNode
 */
export function createDOMNode(
  node: unknown,
  parentNamespace?: string
): Node | null {
  // SSR guard: don't attempt DOM ops when document is unavailable
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

  // Fast paths for primitives (most common)
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

  // Null/undefined/false
  if (!node) {
    return null;
  }

  // Array (fragment) - batch all at once
  if (Array.isArray(node)) {
    maybeWarnMissingKeys(node);
    const fragment = document.createDocumentFragment();
    for (const child of node) {
      const dom = createDOMNode(child, parentNamespace);
      if (dom) fragment.appendChild(dom);
    }
    return fragment;
  }

  // Element or Component
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const type = (node as DOMElement).type;
    const props = ((node as DOMElement).props || {}) as Record<string, unknown>;

    // Intrinsic element (string type)
    if (typeof type === 'string') {
      return createIntrinsicElement(
        node as DOMElement,
        type,
        props,
        parentNamespace
      );
    }

    // Component (function type) - inline execution
    if (typeof type === 'function') {
      return createComponentElement(
        node as ElementWithContext,
        type,
        props,
        parentNamespace
      );
    }

    // For boundary - special handling
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

    // Fragment support
    if (
      typeof type === 'symbol' &&
      (type === Fragment || String(type) === 'Symbol(Fragment)')
    ) {
      return createFragmentElement(node as DOMElement, props, parentNamespace);
    }
  }

  return null;
}

/**
 * Create an intrinsic DOM element (div, span, etc.)
 */
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

  // Materialize key into DOM attribute
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

  // Apply props/attributes
  applyPropsToElement(el, props, type, isHydrationSkipped);

  // Add children
  // CRITICAL: Use nullish coalescing (?) instead of || because children can be 0, false, or empty string

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

    if (syncReactiveScalarChild(el, children, reactiveChildDOMHost)) {
      return el;
    }

    if (Array.isArray(children)) {
      maybeWarnMissingKeys(children);
      if (children.length > 1) {
        // Batch all children into a fragment so we touch the parent only once
        // instead of N times, reducing layout invalidations in the DOM engine.
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

function findHostInstanceByType(
  host: InstanceHostElement,
  type: (props: Props) => unknown
): ComponentInstance | null {
  const instances = host.__ASKR_INSTANCES;
  if (instances && instances.length > 0) {
    for (let index = instances.length - 1; index >= 0; index -= 1) {
      const instance = instances[index]!;
      if (instance.fn === type) {
        return instance;
      }
    }
  }

  return host.__ASKR_INSTANCE?.fn === type ? host.__ASKR_INSTANCE : null;
}

function materializeComponentResultNode(
  childInstance: ComponentInstance,
  result: unknown,
  parentNamespace?: string
): Node {
  const dom = createDOMNode(result, parentNamespace);

  if (dom instanceof Element) {
    mountInstanceInline(childInstance, dom);
    return dom;
  }

  if (!dom) {
    const placeholder = document.createComment('');
    try {
      (
        placeholder as Comment & { __ASKR_INSTANCE?: ComponentInstance }
      ).__ASKR_INSTANCE = childInstance;
    } catch {
      // Ignore placeholder metadata failures.
    }
    childInstance._placeholder = placeholder;
    mountInstanceInline(childInstance, null);
    return placeholder;
  }

  const host = document.createElement('div') as InstanceHostElement;
  host.appendChild(dom);
  host.__ASKR_WRAPPER_HOST = true;
  mountInstanceInline(childInstance, host);
  return host;
}

function resolveNestedComponentResult(
  result: unknown,
  snapshot: ContextFrame | null,
  parentInstance: ComponentInstance | null
): VNode {
  let currentResult = result as VNode;
  let activeSnapshot = snapshot;
  let depth = 0;

  while (
    _isDOMElement(currentResult) &&
    typeof currentResult.type === 'function' &&
    depth < 16
  ) {
    const nestedSnapshot =
      getVNodeContextFrame(currentResult) ?? activeSnapshot;
    const nestedInstance = createComponentInstance(
      nextComponentInstanceId(),
      currentResult.type as ComponentFunction,
      ((currentResult as DOMElement).props ?? {}) as Props,
      null
    );
    nestedInstance.isRoot = isRouteRootComponentVNode(currentResult);
    nestedInstance.parentInstance = parentInstance;
    nestedInstance.portalScope =
      parentInstance?.portalScope ?? nestedInstance.portalScope;
    inheritComponentCleanupStrict(nestedInstance);

    if (nestedSnapshot) {
      nestedInstance.ownerFrame = nestedSnapshot;
    }

    const nextResult = withContext(nestedSnapshot ?? null, () =>
      renderComponentInline(nestedInstance)
    );
    cleanupComponent(nestedInstance);

    if (isPromiseLike(nextResult)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }

    activeSnapshot = nestedSnapshot ?? null;
    currentResult = nextResult as VNode;
    depth += 1;
  }

  return currentResult;
}

function resolveHostNestedComponentResult(
  host: InstanceHostElement,
  retainedInstance: ComponentInstance,
  result: unknown,
  snapshot: ContextFrame | null,
  retainedHostInstances?: Iterable<ComponentInstance>
): VNode {
  let currentResult = result as VNode;
  let activeSnapshot = snapshot;
  let depth = 0;
  const retainedInstances = new Set<ComponentInstance>([retainedInstance]);
  if (retainedHostInstances) {
    for (const instance of retainedHostInstances) {
      retainedInstances.add(instance);
    }
  }
  const createdInstances: ComponentInstance[] = [];

  while (
    _isDOMElement(currentResult) &&
    typeof currentResult.type === 'function' &&
    depth < 16
  ) {
    const nestedSnapshot =
      getVNodeContextFrame(currentResult) ?? activeSnapshot;
    let nestedInstance = findHostInstanceByType(
      host,
      currentResult.type as ComponentFunction
    );
    const hadNestedInstance = !!nestedInstance;

    if (!nestedInstance) {
      nestedInstance = createComponentInstance(
        nextComponentInstanceId(),
        currentResult.type as ComponentFunction,
        ((currentResult as DOMElement).props ?? {}) as Props,
        null
      );
      createdInstances.push(nestedInstance);
    }

    if (hadNestedInstance) {
      captureInlineRenderSnapshot(nestedInstance);
    }

    setVNodeComponentInstance(currentResult, nestedInstance);
    nestedInstance.isRoot = isRouteRootComponentVNode(currentResult);
    nestedInstance.parentInstance = retainedInstance;
    nestedInstance.portalScope =
      retainedInstance.portalScope ?? nestedInstance.portalScope;
    inheritComponentCleanupStrict(nestedInstance);
    nestedInstance.props =
      (((currentResult as DOMElement).props ?? {}) as Props) || {};

    if (nestedSnapshot) {
      nestedInstance.ownerFrame = nestedSnapshot;
    }

    const nextResult = withContext(nestedSnapshot ?? null, () =>
      renderComponentInline(nestedInstance)
    );

    if (isPromiseLike(nextResult)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }

    retainedInstances.add(nestedInstance);
    warnUnusedStateReads(nestedInstance);
    activeSnapshot = nestedSnapshot ?? null;
    currentResult = markVNodeTreeWithContextFrame(
      nextResult,
      activeSnapshot
    ) as VNode;
    depth += 1;
  }

  const previousInstances = host.__ASKR_INSTANCES ?? [];
  for (const instance of previousInstances) {
    if (!retainedInstances.has(instance)) {
      cleanupComponent(instance);
    }
  }

  const nextHostInstances = previousInstances.filter((instance) =>
    retainedInstances.has(instance)
  );
  for (const instance of retainedInstances) {
    if (instance.target === host && !nextHostInstances.includes(instance)) {
      nextHostInstances.push(instance);
    }
  }

  host.__ASKR_INSTANCES = nextHostInstances;
  host.__ASKR_INSTANCE = host.__ASKR_INSTANCES[0] ?? retainedInstance;

  for (const instance of createdInstances) {
    mountInstanceInline(instance, host);
  }

  return currentResult;
}

function resolveWrapperHostResult(
  host: InstanceHostElement,
  result: unknown,
  snapshot: ContextFrame | null
): unknown {
  let currentResult = result;
  let activeSnapshot = snapshot;
  let depth = 0;

  while (
    _isDOMElement(currentResult) &&
    typeof currentResult.type === 'function' &&
    depth < 16
  ) {
    const nestedSnapshot =
      getVNodeContextFrame(currentResult) ?? activeSnapshot;
    const nestedInstance = findHostInstanceByType(
      host,
      currentResult.type as ComponentFunction
    );

    if (!nestedInstance) {
      break;
    }

    captureInlineRenderSnapshot(nestedInstance);

    nestedInstance.props =
      (((currentResult as DOMElement).props ?? {}) as Props) || {};
    nestedInstance.parentInstance = getCurrentInstance();
    nestedInstance.isRoot = isRouteRootComponentVNode(currentResult);
    nestedInstance.portalScope =
      getCurrentInstance()?.portalScope ?? nestedInstance.portalScope;
    inheritComponentCleanupStrict(nestedInstance);

    if (nestedSnapshot) {
      nestedInstance.ownerFrame = nestedSnapshot;
    }

    const nextResult = withContext(nestedSnapshot ?? null, () =>
      renderComponentInline(nestedInstance)
    );

    if (isPromiseLike(nextResult)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }

    warnUnusedStateReads(nestedInstance);
    activeSnapshot = nestedSnapshot ?? null;
    currentResult = nextResult;
    depth += 1;
  }

  return markVNodeTreeWithContextFrame(currentResult, activeSnapshot);
}

export function syncComponentElement(
  currentDom: Node | null,
  node: ElementWithContext,
  type: ComponentFunction,
  props: Record<string, unknown>,
  parentNamespace?: string,
  forceChildrenUpdate = false,
  retainedHostInstances?: Iterable<ComponentInstance>
): Node | null {
  const existingHost =
    currentDom instanceof Element ? (currentDom as InstanceHostElement) : null;
  const existingInstance = existingHost
    ? findHostInstanceByType(existingHost, type)
    : null;
  if (!existingHost) {
    return null;
  }

  if (!existingInstance || existingInstance.fn !== type) {
    const snapshot =
      getVNodeContextFrame(node) || getCurrentContextFrame() || null;
    const hydrationInstance = createComponentInstance(
      nextComponentInstanceId(),
      type,
      props || {},
      existingHost
    );
    hydrationInstance.isRoot = isRouteRootComponentVNode(node);
    hydrationInstance.portalScope =
      getCurrentInstance()?.portalScope ?? hydrationInstance.portalScope;
    inheritComponentCleanupStrict(hydrationInstance);

    setVNodeComponentInstance(node, hydrationInstance);

    if (snapshot) {
      hydrationInstance.ownerFrame = snapshot;
    }

    const result = withContext(snapshot, () =>
      renderComponentInline(hydrationInstance)
    );
    if (isPromiseLike(result)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }

    const scopedResult = markVNodeTreeWithContextFrame(
      result,
      snapshot ?? null
    );

    if (
      scopedResult &&
      typeof scopedResult === 'object' &&
      'type' in (scopedResult as DOMElement) &&
      typeof (scopedResult as DOMElement).type === 'string' &&
      tagNamesEqualIgnoreCase(
        existingHost.tagName,
        (scopedResult as DOMElement).type as string
      )
    ) {
      pruneComponentHostInstances(
        existingHost,
        retainedHostInstances
          ? [hydrationInstance, ...retainedHostInstances]
          : [hydrationInstance]
      );
      withContext(snapshot, () => {
        updateElementFromVnode(
          existingHost,
          inheritComponentKey(scopedResult as DOMElement, node),
          true,
          forceChildrenUpdate || hydrationInstance.mounted === false
        );
        materializeKey(existingHost, node, props);
      });
      mountInstanceInline(hydrationInstance, existingHost);
      itemInstanceHydrationComplete(existingHost);
      warnUnusedStateReads(hydrationInstance);
      return existingHost;
    }

    const resolvedResult = resolveHostNestedComponentResult(
      existingHost,
      hydrationInstance,
      scopedResult,
      snapshot ?? null,
      retainedHostInstances
    );
    if (
      _isDOMElement(resolvedResult) &&
      typeof resolvedResult.type === 'string' &&
      tagNamesEqualIgnoreCase(existingHost.tagName, resolvedResult.type)
    ) {
      withContext(snapshot, () => {
        updateElementFromVnode(
          existingHost,
          inheritComponentKey(resolvedResult, node),
          true,
          forceChildrenUpdate || hydrationInstance.mounted === false
        );
        materializeKey(existingHost, node, props);
      });
      mountInstanceInline(hydrationInstance, existingHost);
      itemInstanceHydrationComplete(existingHost);
      warnUnusedStateReads(hydrationInstance);
      return existingHost;
    }

    const nextDom = materializeComponentResultNode(
      hydrationInstance,
      scopedResult,
      parentNamespace
    );

    if (nextDom instanceof Element) {
      materializeKey(nextDom, node, props);
    }

    if (nextDom !== existingHost && existingHost.parentNode) {
      existingHost.parentNode.replaceChild(nextDom, existingHost);
      cleanupDetachedComponentHost(existingHost, hydrationInstance);
    }

    warnUnusedStateReads(hydrationInstance);
    return nextDom;
  }

  const snapshot =
    getVNodeContextFrame(node) ||
    getCurrentContextFrame() ||
    existingInstance.ownerFrame ||
    null;
  captureInlineRenderSnapshot(existingInstance);
  existingInstance.props = props || {};
  existingInstance.isRoot = isRouteRootComponentVNode(node);
  existingInstance.portalScope =
    getCurrentInstance()?.portalScope ?? existingInstance.portalScope;
  inheritComponentCleanupStrict(existingInstance);

  if (snapshot) {
    existingInstance.ownerFrame = snapshot;
  }

  const result = withContext(snapshot, () =>
    renderComponentInline(existingInstance)
  );
  if (isPromiseLike(result)) {
    throw new Error(
      'Async components are not supported. Components must return synchronously.'
    );
  }
  const scopedResult = markVNodeTreeWithContextFrame(result, snapshot ?? null);

  if (existingHost.__ASKR_WRAPPER_HOST) {
    const wrapperResult = resolveWrapperHostResult(
      existingHost,
      scopedResult,
      snapshot ?? null
    );
    updateElementChildren(
      existingHost,
      normalizeComponentChildren(wrapperResult) as VNode[]
    );
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  if (
    scopedResult &&
    typeof scopedResult === 'object' &&
    'type' in (scopedResult as DOMElement) &&
    typeof (scopedResult as DOMElement).type === 'string' &&
    tagNamesEqualIgnoreCase(
      existingHost.tagName,
      (scopedResult as DOMElement).type as string
    )
  ) {
    pruneComponentHostInstances(
      existingHost,
      retainedHostInstances
        ? [existingInstance, ...retainedHostInstances]
        : [existingInstance]
    );
    withContext(snapshot, () => {
      updateElementFromVnode(
        existingHost,
        inheritComponentKey(scopedResult as DOMElement, node),
        true,
        forceChildrenUpdate || existingInstance.mounted === false
      );
      materializeKey(existingHost, node, props);
    });
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  const resolvedResult = resolveHostNestedComponentResult(
    existingHost,
    existingInstance,
    scopedResult,
    snapshot ?? null,
    retainedHostInstances
  );
  if (
    _isDOMElement(resolvedResult) &&
    typeof resolvedResult.type === 'string' &&
    tagNamesEqualIgnoreCase(existingHost.tagName, resolvedResult.type)
  ) {
    withContext(snapshot, () => {
      updateElementFromVnode(
        existingHost,
        inheritComponentKey(resolvedResult, node),
        true,
        forceChildrenUpdate || existingInstance.mounted === false
      );
      materializeKey(existingHost, node, props);
    });
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  const nextDom = materializeComponentResultNode(
    existingInstance,
    scopedResult,
    parentNamespace
  );

  if (nextDom instanceof Element) {
    materializeKey(nextDom, node, props);
  }

  if (nextDom !== existingHost && existingHost.parentNode) {
    existingHost.parentNode.replaceChild(nextDom, existingHost);
    cleanupDetachedComponentHost(existingHost, existingInstance);
  }

  warnUnusedStateReads(existingInstance);
  return nextDom;
}

function itemInstanceHydrationComplete(host: InstanceHostElement): void {
  const instance = host.__ASKR_INSTANCE;
  if (instance) {
    const scope = (
      instance as unknown as { scope?: { hydrationPending?: boolean } }
    ).scope;
    if (scope) {
      scope.hydrationPending = false;
    }
  }
}

function createComponentElement(
  node: ElementWithContext,
  type: (props: never) => unknown,
  props: Record<string, unknown>,
  parentNamespace?: string
): Node {
  // Check if this vnode has a marked context frame
  const frame = getVNodeContextFrame(node);
  const snapshot = frame || getCurrentContextFrame();

  const componentFn = type as unknown as (props: Props) => unknown;
  const isAsync = componentFn.constructor.name === 'AsyncFunction';

  if (isAsync) {
    throw new Error(
      'Async components are not supported. Use resource() for async work.'
    );
  }

  // Ensure there is a persistent instance object attached to this vnode
  let childInstance = getVNodeComponentInstance(node);
  const hadChildInstance = !!childInstance;
  if (!childInstance) {
    childInstance = createComponentInstance(
      nextComponentInstanceId(),
      componentFn as ComponentFunction,
      props || {},
      null
    );
    setVNodeComponentInstance(node, childInstance);
  }

  if (hadChildInstance) {
    captureInlineRenderSnapshot(childInstance);
  }

  childInstance.portalScope =
    getCurrentInstance()?.portalScope ?? childInstance.portalScope;
  childInstance.parentInstance = getCurrentInstance();
  childInstance.props = props || {};
  childInstance.isRoot = isRouteRootComponentVNode(node);
  inheritComponentCleanupStrict(childInstance);

  if (snapshot) {
    childInstance.ownerFrame = snapshot;
  }

  const result = withContext(snapshot, () =>
    renderComponentInline(childInstance)
  );

  if (isPromiseLike(result)) {
    throw new Error(
      'Async components are not supported. Components must return synchronously.'
    );
  }

  const scopedResult = markVNodeTreeWithContextFrame(result, snapshot ?? null);

  const dom = withContext(snapshot, () =>
    materializeComponentResultNode(childInstance, scopedResult, parentNamespace)
  );

  warnUnusedStateReads(childInstance);

  if (dom instanceof Element) {
    materializeKey(dom, node, props);
  }
  return dom;
}

/**
 * Create a document fragment from Fragment vnode
 */
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

type ErrorBoundaryVNode = DOMElement & {
  __instance?: ComponentInstance;
};

function createErrorBoundaryElement(
  node: ErrorBoundaryVNode,
  props: Record<string, unknown>,
  parentNamespace?: string
): Node {
  const boundaryState = node.__instance?.errorBoundaryState ?? null;
  const reset = node.__instance
    ? createBoundaryReset(node.__instance)
    : () => {};
  const fallback = props.fallback as ErrorBoundaryProps['fallback'];
  const children = props.children as ErrorBoundaryProps['children'];

  if (boundaryState?.error != null) {
    const fallbackValue = resolveErrorBoundaryFallback(
      fallback,
      boundaryState.error,
      reset
    );
    if (fallbackValue instanceof Node) {
      return fallbackValue;
    }
    const fallbackDom = createDOMNode(fallbackValue, parentNamespace);
    return fallbackDom ?? document.createComment('');
  }

  try {
    const dom = createDOMNode(children, parentNamespace);
    return dom ?? document.createComment('');
  } catch (error) {
    if (node.__instance) {
      reportBoundaryError(
        node.__instance,
        error,
        props.onError as ((next: unknown) => void) | undefined
      );
    } else {
      logger.error('[Askr] ErrorBoundary caught render error:', error);
    }

    const fallbackValue = resolveErrorBoundaryFallback(fallback, error, reset);
    if (fallbackValue instanceof Node) {
      return fallbackValue;
    }
    const fallbackDom = createDOMNode(fallbackValue, parentNamespace);
    return fallbackDom ?? document.createComment('');
  }
}

function normalizeStableIntrinsicChildren(
  children: VNode | VNode[] | undefined
): VNode[] {
  if (children === null || children === undefined || children === false) {
    return [];
  }

  return Array.isArray(children) ? children : [children];
}

function getStableIntrinsicChildren(vnode: DOMElement): VNode[] {
  return normalizeStableIntrinsicChildren(
    (vnode.props?.children as VNode | VNode[] | undefined) ?? vnode.children
  );
}

function patchStableIntrinsicText(domNode: Node, nextVNode: VNode): boolean {
  if (
    domNode.nodeType !== 3 ||
    (typeof nextVNode !== 'string' && typeof nextVNode !== 'number')
  ) {
    return false;
  }

  const nextText = String(nextVNode);
  const textNode = domNode as Text;
  if (textNode.data !== nextText) {
    recordBenchEvent('domTextSet');
    textNode.data = nextText;
  }

  return true;
}

function patchStableIntrinsicElement(
  dom: Element,
  nextVNode: DOMElement
): boolean {
  if (
    typeof nextVNode.type !== 'string' ||
    !tagNamesEqualIgnoreCase(dom.tagName, nextVNode.type)
  ) {
    return false;
  }

  updateElementFromVnode(dom, nextVNode, false);

  const nextChildren = getStableIntrinsicChildren(nextVNode);
  if (dom.childNodes.length !== nextChildren.length) {
    return false;
  }

  for (let index = 0; index < nextChildren.length; index += 1) {
    const nextChild = nextChildren[index];

    const currentChildNode = dom.childNodes[index];
    if (!currentChildNode) {
      return false;
    }

    if (patchStableIntrinsicText(currentChildNode, nextChild)) {
      continue;
    }

    if (
      currentChildNode instanceof Element &&
      _isDOMElement(nextChild) &&
      typeof nextChild.type === 'string' &&
      patchStableIntrinsicElement(currentChildNode, nextChild)
    ) {
      continue;
    }

    return false;
  }

  return true;
}

function resolveStableIntrinsicPatchVNode(
  dom: Element,
  vnode: VNode
): DOMElement | null {
  if (!_isDOMElement(vnode)) {
    return null;
  }

  if (typeof vnode.type === 'string') {
    return tagNamesEqualIgnoreCase(dom.tagName, vnode.type) ? vnode : null;
  }

  if (typeof vnode.type !== 'function') {
    return null;
  }

  const host = dom as InstanceHostElement;
  const existingInstance = findHostInstanceByType(
    host,
    vnode.type as ComponentFunction
  );
  if (
    !existingInstance ||
    existingInstance.fn !== vnode.type ||
    host.__ASKR_WRAPPER_HOST
  ) {
    return null;
  }

  const snapshot =
    getVNodeContextFrame(vnode) ||
    getCurrentContextFrame() ||
    existingInstance.ownerFrame ||
    null;

  captureInlineRenderSnapshot(existingInstance);

  existingInstance.props =
    (((vnode as DOMElement).props ?? {}) as Record<string, unknown>) || {};
  existingInstance.isRoot = isRouteRootComponentVNode(vnode);
  existingInstance.portalScope =
    getCurrentInstance()?.portalScope ?? existingInstance.portalScope;
  inheritComponentCleanupStrict(existingInstance);

  if (snapshot) {
    existingInstance.ownerFrame = snapshot;
  }

  const result = withContext(snapshot, () =>
    renderComponentInline(existingInstance)
  );
  if (isPromiseLike(result)) {
    throw new Error(
      'Async components are not supported. Components must return synchronously.'
    );
  }

  const resolvedResult = resolveNestedComponentResult(
    result,
    snapshot ?? null,
    existingInstance
  );
  if (
    _isDOMElement(resolvedResult) &&
    typeof resolvedResult.type === 'string' &&
    tagNamesEqualIgnoreCase(dom.tagName, resolvedResult.type)
  ) {
    return inheritComponentKey(resolvedResult, vnode as DOMElement);
  }

  return null;
}

export function tryPatchStableForDirtyItem(scope: {
  dom?: Node;
  vnode?: VNode;
}): boolean {
  incDevCounter('stableForPatchAttempt');
  if (!(scope.dom instanceof Element) || scope.vnode === undefined) {
    return false;
  }

  const nextIntrinsic = resolveStableIntrinsicPatchVNode(
    scope.dom,
    scope.vnode
  );
  if (!nextIntrinsic) {
    return false;
  }

  const didPatch = patchStableIntrinsicElement(scope.dom, nextIntrinsic);

  const existingInstance = (scope.dom as InstanceHostElement).__ASKR_INSTANCE;
  if (didPatch && existingInstance) {
    warnUnusedStateReads(existingInstance);
  }

  if (didPatch) {
    incDevCounter('stableForPatchHit');
  }

  return didPatch;
}

// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼
configureBoundaryDOMHost({
  createDOMNode,
  syncComponentElement,
  updateElementFromVnode,
  tryPatchStableForDirtyItem,
});

// Element Updates
// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼

/**
 * Update an existing element's attributes and children from vnode
 */
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

  // Ensure key is materialized
  materializeKey(el, vnode, props);
  updateElementRef(el, props.ref);

  // Fast path: when element has no tracked listeners/reactive props and all
  // static scalar props already match, skip full prop diff machinery.
  if (
    !hasTrackedElementPropBindings(el)
  ) {
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
    reactiveChildDOMHost
  );
  syncElementPropBindings(el, domVNode, props, usesReactiveChildren);

  // Update children
  if (updateChildren) {
    const children =
      (props.children as VNode | VNode[] | undefined) ?? vnode.children;
    if (usesReactiveChildren) {
      return;
    }
    updateElementChildren(el, children, forceChildrenUpdate);
  }
}

export function updateElementChildren(
  el: Element,
  children: VNode | VNode[] | undefined,
  forceUpdate = false
): void {
  const directControlBoundary = getDirectControlBoundaryVNode(children);
  if (directControlBoundary) {
    const controlState = getControlBoundaryState(directControlBoundary);
    if (!controlState) {
      throw new Error(
        '[updateElementChildren] Control boundary missing internal state'
      );
    }

    registerControlBoundaryCommitOwner(el, controlState);
    const childrenVNodes = evaluateControlBoundaryState(controlState);
    commitForBoundaryChildren(el, controlState, childrenVNodes as VNode[]);
    return;
  }

  clearControlBoundaryCommitOwner(el);

  // CRITICAL: Check for null/undefined explicitly, not falsy values
  // because 0, false, and '' are valid children
  if (children === null || children === undefined) {
    // Clean up all children before clearing
    for (let n = el.firstChild; n; ) {
      const next = n.nextSibling;
      teardownNodeSubtree(n);
      n = next;
    }
    el.textContent = '';
    return;
  }

  if (!Array.isArray(children) && isFragmentVNode(children)) {
    updateUnkeyedChildren(
      el,
      normalizeComponentChildren(children),
      forceUpdate
    );
    return;
  }

  if (
    !Array.isArray(children) &&
    (typeof children === 'string' || typeof children === 'number')
  ) {
    if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
      const s = String(children);
      const t = el.firstChild as Text;
      // Skip the write when the text is already correct ├óΓé¼ΓÇ¥ avoids triggering
      // DOM mutation observers and text layout passes for unchanged nodes.
      if (t.data !== s) t.data = s;
    } else {
      // Clean up all children before replacing with text
      for (let n = el.firstChild; n; ) {
        const next = n.nextSibling;
        teardownNodeSubtree(n);
        n = next;
      }
      el.textContent = String(children);
    }
    return;
  }

  if (Array.isArray(children)) {
    const normalizedChildren = normalizeComponentChildren(children) as VNode[];

    if (
      trySyncScalarChildSequenceInPlace(
        el,
        normalizedChildren,
        reactiveChildDOMHost
      )
    ) {
      keyedElements.delete(el);
      return;
    }

    if (hasKeyedVNodeChildren(normalizedChildren)) {
      const oldKeyMap = getOrBuildDomKeyMap(el);
      const newKeyMap = reconcileKeyedChildren(
        el,
        normalizedChildren,
        oldKeyMap
      );
      keyedElements.set(el, newKeyMap);
      return;
    }
    if (isBulkTextFastPathEligible(el, normalizedChildren)) {
      performBulkTextReplace(el, normalizedChildren);
      keyedElements.delete(el);
      return;
    }
    updateUnkeyedChildren(el, normalizedChildren, forceUpdate);
    return;
  }

  if (_isDOMElement(children)) {
    updateUnkeyedChildren(el, [children], forceUpdate);
    return;
  }

  // Clean up all children before clearing
  for (let n = el.firstChild; n; ) {
    const next = n.nextSibling;
    teardownNodeSubtree(n);
    n = next;
  }
  el.textContent = '';
  const dom = createDOMNode(children);
  if (dom) el.appendChild(dom);
}

function hasKeyedVNodeChildren(children: VNode[]): boolean {
  for (let i = 0; i < children.length; i++) {
    if (extractKey(children[i]) !== undefined) return true;
  }
  return false;
}

function isEmptyChild(child: unknown): boolean {
  return child === null || child === undefined || child === false;
}

function getOrBuildDomKeyMap(
  parent: Element
): Map<string | number, Element> | undefined {
  let keyMap = keyedElements.get(parent);
  if (!keyMap) {
    keyMap = new Map<string | number, Element>();
    for (
      let child = parent.firstElementChild;
      child;
      child = child.nextElementSibling
    ) {
      const key = child.getAttribute('data-key');
      if (key !== null) {
        keyMap.set(key, child);
        const numericKey = Number(key);
        if (!Number.isNaN(numericKey)) keyMap.set(numericKey, child);
      }
    }
    if (keyMap.size > 0) keyedElements.set(parent, keyMap);
  }
  return keyMap.size > 0 ? keyMap : undefined;
}

export function updateUnkeyedChildren(
  parent: Element,
  newChildren: unknown[],
  forceUpdate = false
): void {
  const parentNamespace = getParentNamespace(parent);

  const trySyncComponentChild = (
    currentDom: Element,
    next: DOMElement
  ): Node | null => {
    if (typeof next.type !== 'function') {
      return null;
    }

    return syncComponentElement(
      currentDom,
      next as ElementWithContext,
      next.type as ComponentFunction,
      (((next as DOMElement).props ?? {}) as Record<string, unknown>) || {},
      parentNamespace,
      forceUpdate
    );
  };

  // Check if newChildren has mixed content (both text/primitives and elements)
  const hasText = newChildren.some(
    (c) => typeof c === 'string' || typeof c === 'number'
  );
  const hasElements = newChildren.some((c) => _isDOMElement(c));
  const hasEmptyChildren = newChildren.some(isEmptyChild);
  const hasComponentChildren = newChildren.some(
    (c) => _isDOMElement(c) && typeof (c as DOMElement).type === 'function'
  );
  const hasNonElementDomChildren =
    parent.childNodes.length !== parent.children.length;

  // Fast path: same-count, pure-element update (the common large-list re-render).
  // Iterate parent.children by index directly to avoid the Array.from snapshot
  // allocation for large lists. replaceChild(x, child[i]) replaces in-place so
  // subsequent indices in the live HTMLCollection do NOT shift ├óΓé¼ΓÇ¥ safe to use.
  if (
    !hasEmptyChildren &&
    !hasText &&
    !hasComponentChildren &&
    !hasNonElementDomChildren &&
    hasElements &&
    parent.children.length === newChildren.length
  ) {
    const c = parent.children;
    for (let i = 0; i < newChildren.length; i++) {
      const next = newChildren[i];
      const current = c[i];
      if (!current || next === undefined) continue;
      if (_isDOMElement(next) && typeof next.type === 'string') {
        if (tagsEqualIgnoreCase(current.tagName, next.type)) {
          updateElementFromVnode(current, next, true, forceUpdate);
        } else {
          const dom = createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      } else if (_isDOMElement(next)) {
        if (trySyncControlBoundaryChild(parent, current, next)) {
          continue;
        }

        const synced = trySyncComponentChild(current, next);
        if (synced && synced !== current) {
          teardownNodeSubtree(current);
        } else if (!synced) {
          const dom = createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      } else {
        const dom = createDOMNode(next, parentNamespace);
        if (dom) {
          teardownNodeSubtree(current);
          parent.replaceChild(dom, current);
        }
      }
    }
    return;
  }

  const existing = Array.from(parent.children);

  // Use childNodes whenever non-element DOM can participate in the sequence.
  // Component children can render text, comments, fragments, or elements, so
  // parent.children is not a safe positional view for those updates.
  if (
    hasText ||
    hasComponentChildren ||
    hasEmptyChildren ||
    hasNonElementDomChildren
  ) {
    const allNodes = Array.from(parent.childNodes);
    const max = Math.max(allNodes.length, newChildren.length);

    for (let i = 0; i < max; i++) {
      const currentNode = allNodes[i];
      const next = newChildren[i];
      const nextIsEmpty = isEmptyChild(next);

      // Remove extra existing nodes
      if (nextIsEmpty && currentNode) {
        teardownNodeSubtree(currentNode);
        currentNode.remove();
        continue;
      }

      // Append new children beyond existing length
      if (!currentNode && !nextIsEmpty) {
        const dom = createDOMNode(next, parentNamespace);
        if (dom) parent.appendChild(dom);
        continue;
      }

      if (!currentNode || nextIsEmpty) continue;

      // Update existing node based on next vnode/primitive
      if (typeof next === 'string' || typeof next === 'number') {
        // New child is text
        if (currentNode.nodeType === 3) {
          // Existing is text node - update it
          (currentNode as Text).data = String(next);
        } else {
          // Existing is element - replace with text node
          const textNode = document.createTextNode(String(next));
          parent.replaceChild(textNode, currentNode);
        }
      } else if (_isDOMElement(next)) {
        // New child is element
        if (currentNode.nodeType === 1) {
          // Existing is element
          const currentEl = currentNode as Element;
          if (typeof next.type === 'string') {
            if (tagsEqualIgnoreCase(currentEl.tagName, next.type)) {
              // Same type - update in place
              updateElementFromVnode(currentEl, next, true, forceUpdate);
            } else {
              // Different type - replace
              const dom = createDOMNode(next, parentNamespace);
              if (dom) {
                teardownNodeSubtree(currentEl);
                parent.replaceChild(dom, currentNode);
              }
            }
          } else {
            if (trySyncControlBoundaryChild(parent, currentNode, next)) {
              continue;
            }

            const synced = trySyncComponentChild(currentEl, next);
            if (synced && synced !== currentNode) {
              teardownNodeSubtree(currentEl);
            } else if (!synced) {
              const dom = createDOMNode(next, parentNamespace);
              if (dom) {
                teardownNodeSubtree(currentEl);
                parent.replaceChild(dom, currentNode);
              }
            }
          }
        } else {
          // Existing is text node - replace with element
          const dom = createDOMNode(next, parentNamespace);
          if (dom) parent.replaceChild(dom, currentNode);
        }
      }
    }
    return;
  }

  // Special case: if we have a single text/number child and the parent has a single text node,
  // update the text node in place to preserve identity
  if (
    newChildren.length === 1 &&
    existing.length === 0 &&
    parent.childNodes.length === 1
  ) {
    const firstNewChild = newChildren[0];
    const firstExisting = parent.firstChild;
    if (
      (typeof firstNewChild === 'string' ||
        typeof firstNewChild === 'number') &&
      firstExisting?.nodeType === 3 // Text node
    ) {
      (firstExisting as Text).data = String(firstNewChild);
      return;
    }
  }

  // If there are only text nodes (no element children), clear before updating
  if (existing.length === 0 && parent.childNodes.length > 0) {
    // Clean up all children before clearing
    for (let n = parent.firstChild; n; ) {
      const next = n.nextSibling;
      teardownNodeSubtree(n);
      n = next;
    }
    parent.textContent = '';
  }
  const max = Math.max(existing.length, newChildren.length);

  for (let i = 0; i < max; i++) {
    const current = existing[i];
    const next = newChildren[i];
    const nextIsEmpty = isEmptyChild(next);

    // Remove extra existing children
    if (nextIsEmpty && current) {
      // Clean up any component instance mounted on this node
      teardownNodeSubtree(current);
      current.remove();
      continue;
    }

    // Append new children beyond existing length
    if (!current && !nextIsEmpty) {
      const dom = createDOMNode(next, parentNamespace);
      if (dom) parent.appendChild(dom);
      continue;
    }

    if (!current || nextIsEmpty) continue;

    // Update existing element based on next vnode/primitive
    if (typeof next === 'string' || typeof next === 'number') {
      const textNode = document.createTextNode(String(next));
      teardownNodeSubtree(current);
      parent.replaceChild(textNode, current);
    } else if (_isDOMElement(next)) {
      if (typeof next.type === 'string') {
        // If element type matches, update in place; otherwise replace
        if (tagsEqualIgnoreCase(current.tagName, next.type)) {
          updateElementFromVnode(current, next, true, forceUpdate);
        } else {
          const dom = createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      } else {
        const synced = trySyncComponentChild(current, next);
        if (synced && synced !== current) {
          teardownNodeSubtree(current);
        } else if (!synced) {
          const dom = createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      }
    } else {
      // Fallback for other types: replace
      const dom = createDOMNode(next);
      if (dom) {
        teardownNodeSubtree(current);
        parent.replaceChild(dom, current);
      }
    }
  }
}
