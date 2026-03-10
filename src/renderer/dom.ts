import { logger } from '../dev/logger';
import type { Props } from '../common/props';
import { Fragment } from '../jsx/jsx-runtime';
import {
  CONTEXT_FRAME_SYMBOL,
  withContext,
  getCurrentContextFrame,
  ContextFrame,
} from '../runtime/context';
import {
  createComponentInstance,
  renderComponentInline,
  mountInstanceInline,
  getCurrentInstance,
  setCurrentComponentInstance as _setCurrentInstance,
  type ComponentInstance,
  type ComponentFunction,
} from '../runtime/component';
import {
  elementListeners,
  removeAllListeners,
  teardownNodeSubtree,
  elementReactivePropsCleanup,
  removeElementReactiveProps,
} from './cleanup';
import {
  setDevValue,
  incDevCounter,
  getDevValue,
} from '../runtime/dev-namespace';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { __FOR_BOUNDARY__ } from '../common/vnode';
import { evaluateForState } from '../runtime/for';
import { keyedElements } from './keyed';
import { reconcileKeyedChildren } from './reconcile';
import {
  parseEventName,
  getPassiveOptions,
  createWrappedHandler,
  isSkippedProp,
  hasNonTrivialProps,
  now,
  recordDOMReplace,
  recordFastPathStats,
  logFastPathDebug,
} from './utils';
import type { State } from '../runtime/state';
import { globalScheduler } from '../runtime/scheduler';
import { incrementPerfMetric } from '../runtime/perf-metrics';
import {
  isEventDelegationEnabled,
  addDelegatedListener,
  removeDelegatedListener,
  clearDelegatedHandlersForElement as _clearDelegatedHandlersForElement,
  isDelegatedEvent,
} from '../runtime/events';

type ElementWithContext = DOMElement & {
  [CONTEXT_FRAME_SYMBOL]?: ContextFrame;
  __instance?: ComponentInstance;
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

// ─────────────────────────────────────────────────────────────────────────────
// Event Handler Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add an event listener to an element with tracking
 * Uses event delegation when enabled (opt-out model)
 */
function addTrackedListener(
  el: Element,
  eventName: string,
  handler: EventListener
): void {
  const useDelegation =
    isEventDelegationEnabled() && isDelegatedEvent(eventName);

  if (useDelegation) {
    addDelegatedListener(el, eventName, handler, handler, undefined);
  }

  const options = getPassiveOptions(eventName);
  const trackedHandler = useDelegation
    ? handler
    : createWrappedHandler(handler, true);

  if (!useDelegation) {
    if (options !== undefined) {
      el.addEventListener(eventName, trackedHandler, options);
    } else {
      el.addEventListener(eventName, trackedHandler);
    }
  }

  if (!elementListeners.has(el)) {
    elementListeners.set(el, new Map());
  }
  elementListeners.get(el)!.set(eventName, {
    handler: trackedHandler,
    original: handler,
    options,
    isDelegated: useDelegation,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reactive Prop Management - Dirty Descriptor Invalidation
// ─────────────────────────────────────────────────────────────────────────────

interface ReactivePropDescriptor {
  el: Element;
  propName: string;
  propFn: () => unknown;
  tagName: string;
  readStates: Set<State<unknown>>;
  isActive: boolean;
  lastValue: unknown;
}

const reactivePropRegistry = new Set<ReactivePropDescriptor>();
const dirtyReactiveProps = new Set<ReactivePropDescriptor>();
const reactivePropsByState = new WeakMap<
  State<unknown>,
  Set<ReactivePropDescriptor>
>();
let hasPendingReactivePropFlush = false;
let reactivePropTrackingToken = 0;

const reactivePropTrackingInstance = {
  _pendingReadStates: new Set<State<unknown>>(),
  _currentRenderToken: 0,
} as Partial<ComponentInstance> as ComponentInstance;

function registerReactivePropState(
  stateValue: State<unknown>,
  descriptor: ReactivePropDescriptor
): void {
  let descriptors = reactivePropsByState.get(stateValue);
  if (!descriptors) {
    descriptors = new Set();
    reactivePropsByState.set(stateValue, descriptors);
  }
  descriptors.add(descriptor);
}

function unregisterReactivePropState(
  stateValue: State<unknown>,
  descriptor: ReactivePropDescriptor
): void {
  reactivePropsByState.get(stateValue)?.delete(descriptor);
}

function syncReactivePropSubscriptions(
  descriptor: ReactivePropDescriptor,
  nextReadStates: Set<State<unknown>>
): void {
  for (const stateValue of descriptor.readStates) {
    if (!nextReadStates.has(stateValue)) {
      unregisterReactivePropState(stateValue, descriptor);
    }
  }

  for (const stateValue of nextReadStates) {
    if (!descriptor.readStates.has(stateValue)) {
      registerReactivePropState(stateValue, descriptor);
    }
  }

  descriptor.readStates = nextReadStates;
}

function clearReactivePropSubscriptions(descriptor: ReactivePropDescriptor): void {
  for (const stateValue of descriptor.readStates) {
    unregisterReactivePropState(stateValue, descriptor);
  }
  descriptor.readStates.clear();
}

function evaluateReactiveProp(
  descriptor: ReactivePropDescriptor
): { value: unknown; readStates: Set<State<unknown>> } {
  const prevInstance = getCurrentInstance();
  const nextReadStates = new Set<State<unknown>>();

  reactivePropTrackingToken += 1;
  reactivePropTrackingInstance._pendingReadStates = nextReadStates;
  reactivePropTrackingInstance._currentRenderToken = reactivePropTrackingToken;

  _setCurrentInstance(reactivePropTrackingInstance);

  try {
    return {
      value: descriptor.propFn(),
      readStates: nextReadStates,
    };
  } finally {
    reactivePropTrackingInstance._pendingReadStates = new Set();
    reactivePropTrackingInstance._currentRenderToken = 0;
    _setCurrentInstance(prevInstance);
  }
}

function flushDirtyReactiveProps(): void {
  hasPendingReactivePropFlush = false;

  if (dirtyReactiveProps.size === 0) {
    return;
  }

  const pending = Array.from(dirtyReactiveProps);
  dirtyReactiveProps.clear();

  for (const descriptor of pending) {
    if (!descriptor.isActive) continue;

    incrementPerfMetric('reactivePropReevaluations');

    try {
      const { value, readStates } = evaluateReactiveProp(descriptor);
      syncReactivePropSubscriptions(descriptor, readStates);

      if (Object.is(descriptor.lastValue, value)) {
        incrementPerfMetric('skippedDomPropWrites');
        continue;
      }

      descriptor.lastValue = value;
      applyPropValue(
        descriptor.el,
        descriptor.propName,
        value,
        descriptor.tagName
      );
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        logger.warn('[Askr] Reactive prop update failed:', err);
      }
    }
  }
}

export function markReactivePropsDirtyState(
  stateValue: State<unknown>
): void {
  const descriptors = reactivePropsByState.get(stateValue);
  if (!descriptors || descriptors.size === 0) {
    return;
  }

  let shouldScheduleFlush = false;
  for (const descriptor of descriptors) {
    if (!descriptor.isActive || dirtyReactiveProps.has(descriptor)) {
      continue;
    }
    dirtyReactiveProps.add(descriptor);
    shouldScheduleFlush = true;
  }

  if (shouldScheduleFlush && !hasPendingReactivePropFlush) {
    hasPendingReactivePropFlush = true;
    globalScheduler.enqueue(flushDirtyReactiveProps);
  }
}

/**
 * Set up a reactive prop that re-evaluates when its dependencies change
 * Returns a cleanup function to unsubscribe
 */
function setupReactiveProp(
  el: Element,
  propName: string,
  propFn: () => unknown,
  tagName: string
): () => void {
  const descriptor: ReactivePropDescriptor = {
    el,
    propName,
    propFn,
    tagName,
    readStates: new Set(),
    isActive: true,
    lastValue: undefined,
  };

  reactivePropRegistry.add(descriptor);
  const { value, readStates } = evaluateReactiveProp(descriptor);
  descriptor.lastValue = value;
  syncReactivePropSubscriptions(descriptor, readStates);
  applyPropValue(el, propName, value, tagName);

  // Return cleanup function
  return () => {
    descriptor.isActive = false;
    reactivePropRegistry.delete(descriptor);
    dirtyReactiveProps.delete(descriptor);
    clearReactivePropSubscriptions(descriptor);
  };
}

/**
 * Apply a prop value to an element (helper for reactive props)
 */
function applyPropValue(
  el: Element,
  key: string,
  value: unknown,
  tagName: string
): void {
  if (value === undefined || value === null || value === false) {
    if (key === 'class' || key === 'className') {
      el.className = '';
    } else {
      el.removeAttribute(key);
    }
    return;
  }

  if (key === 'class' || key === 'className') {
    el.className = String(value);
  } else if (key === 'value' || key === 'checked') {
    applyFormControlProp(el, key, value, tagName);
  } else {
    el.setAttribute(key, String(value));
  }
}

/**
 * Apply attributes and event listeners to an element from props
 */
function applyPropsToElement(
  el: Element,
  props: Record<string, unknown>,
  tagName: string
): void {
  if (isHydrationSkipped(el)) {
    return;
  }

  for (const key in props) {
    const value = props[key];
    // Handle ref BEFORE isSkippedProp check since it needs special processing
    if (key === 'ref') {
      applyRef(el, value);
      continue;
    }
    if (isSkippedProp(key)) continue;
    if (value === undefined || value === null || value === false) continue;

    const eventName = parseEventName(key);
    if (eventName) {
      addTrackedListener(el, eventName, value as EventListener);
      continue;
    }

    // Check if value is a function (reactive prop)
    if (typeof value === 'function' && !eventName && key !== 'ref') {
      // Set up reactive prop tracking
      const cleanup = setupReactiveProp(
        el,
        key,
        value as () => unknown,
        tagName
      );

      // Store cleanup function and function reference
      if (!elementReactivePropsCleanup.has(el)) {
        elementReactivePropsCleanup.set(el, new Map());
      }
      elementReactivePropsCleanup.get(el)!.set(key, {
        cleanup,
        fnRef: value as () => unknown,
      });
      continue;
    }

    if (key === 'class' || key === 'className') {
      el.className = String(value);
    } else if (key === 'value' || key === 'checked') {
      applyFormControlProp(el, key, value, tagName);
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

type Ref<T> =
  | ((value: T | null) => void)
  | { current: T | null }
  | null
  | undefined;

function applyRef<T>(el: T, ref: unknown): void {
  const r = ref as Ref<T>;
  if (!r) return;
  if (typeof r === 'function') {
    r(el);
    return;
  }
  // Fast path: use Object.isExtensible check instead of try/catch
  if (Object.isExtensible(r)) {
    (r as { current: T | null }).current = el;
  }
}

/**
 * Apply value/checked props to form controls
 */
function applyFormControlProp(
  el: Element,
  key: string,
  value: unknown,
  tagName: string
): void {
  if (key === 'value') {
    if (
      tagNamesEqualIgnoreCase(tagName, 'input') ||
      tagNamesEqualIgnoreCase(tagName, 'textarea') ||
      tagNamesEqualIgnoreCase(tagName, 'select')
    ) {
      (el as HTMLInputElement & Props).value = String(value);
      el.setAttribute('value', String(value));
    } else {
      el.setAttribute('value', String(value));
    }
  } else if (key === 'checked') {
    if (tagNamesEqualIgnoreCase(tagName, 'input')) {
      (el as HTMLInputElement & Props).checked = Boolean(value);
      el.setAttribute('checked', String(Boolean(value)));
    } else {
      el.setAttribute('checked', String(Boolean(value)));
    }
  }
}

/**
 * Materialize vnode key as data-key attribute
 */
function materializeKey(
  el: Element,
  vnode: DOMElement,
  props: Record<string, unknown>
): void {
  const vnodeKey = vnode.key ?? props?.key;
  if (vnodeKey !== undefined) {
    el.setAttribute('data-key', String(vnodeKey));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic List Warnings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Warn about missing keys on dynamic lists (dev only)
 */
function warnMissingKeys(children: unknown[]): void {
  if (process.env.NODE_ENV === 'production') return;

  let hasElements = false;
  let hasKeys = false;

  for (const item of children) {
    if (typeof item === 'object' && item !== null && 'type' in item) {
      if ((item as DOMElement).type === __FOR_BOUNDARY__) continue;
      hasElements = true;
      const rawKey =
        (item as DOMElement).key ??
        ((item as DOMElement).props as Record<string, unknown> | undefined)
          ?.key;
      if (rawKey !== undefined) {
        hasKeys = true;
        break;
      }
    }
  }

  if (hasElements && !hasKeys) {
    const inst = getCurrentInstance();
    if (inst?.devWarningsEmitted.has('missing-keys')) return;
    inst?.devWarningsEmitted.add('missing-keys');
    try {
      const name = inst?.fn?.name || '<anonymous>';
      logger.warn(
        `Missing keys on dynamic lists in ${name}. Each child in a list should have a unique "key" prop.`
      );
    } catch {
      logger.warn(
        'Missing keys on dynamic lists. Each child in a list should have a unique "key" prop.'
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM Node Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a DOM node from a VNode
 */
export function createDOMNode(node: unknown): Node | null {
  // SSR guard: don't attempt DOM ops when document is unavailable
  if (!IS_DOM_AVAILABLE) {
    if (process.env.NODE_ENV !== 'production') {
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
    return document.createTextNode(node);
  }
  if (typeof node === 'number') {
    return document.createTextNode(String(node));
  }

  // Null/undefined/false
  if (!node) {
    return null;
  }

  // Array (fragment) - batch all at once
  if (Array.isArray(node)) {
    const fragment = document.createDocumentFragment();
    for (const child of node) {
      const dom = createDOMNode(child);
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
      return createIntrinsicElement(node as DOMElement, type, props);
    }

    // Component (function type) - inline execution
    if (typeof type === 'function') {
      return createComponentElement(node as ElementWithContext, type, props);
    }

    // For boundary - special handling
    if (type === __FOR_BOUNDARY__) {
      return createForBoundary(node as DOMElement, props);
    }

    // Fragment support
    if (
      typeof type === 'symbol' &&
      (type === Fragment || String(type) === 'Symbol(Fragment)')
    ) {
      return createFragmentElement(node as DOMElement, props);
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
  props: Record<string, unknown>
): Element {
  const el = document.createElement(type);

  // Materialize key into DOM attribute
  materializeKey(el, node, props);

  // Apply props/attributes
  applyPropsToElement(el, props, type);

  // Add children
  // CRITICAL: Use nullish coalescing (?) instead of || because children can be 0, false, or empty string
  const children = props.children ?? node.children;

  if (children !== null && children !== undefined) {
    if (Array.isArray(children)) {
      warnMissingKeys(children);
      for (const child of children) {
        const dom = createDOMNode(child);
        if (dom) el.appendChild(dom);
      }
    } else {
      const dom = createDOMNode(children);
      if (dom) el.appendChild(dom);
    }
  }

  return el;
}

/**
 * Create element from a component function
 */
function createComponentElement(
  node: ElementWithContext,
  type: (props: Props) => unknown,
  props: Record<string, unknown>
): Node {
  // Check if this vnode has a marked context frame
  const frame = node[CONTEXT_FRAME_SYMBOL];
  const snapshot = frame || getCurrentContextFrame();

  const componentFn = type as (props: Props) => unknown;
  const isAsync = componentFn.constructor.name === 'AsyncFunction';

  if (isAsync) {
    throw new Error(
      'Async components are not supported. Use resource() for async work.'
    );
  }

  // Ensure there is a persistent instance object attached to this vnode
  let childInstance = node.__instance;
  if (!childInstance) {
    childInstance = createComponentInstance(
      nextComponentInstanceId(),
      componentFn as ComponentFunction,
      props || {},
      null
    );
    node.__instance = childInstance;
  }

  if (snapshot) {
    childInstance.ownerFrame = snapshot;
  }

  const result = withContext(snapshot, () =>
    renderComponentInline(childInstance)
  );

  if (result instanceof Promise) {
    throw new Error(
      'Async components are not supported. Components must return synchronously.'
    );
  }

  const dom = withContext(snapshot, () => createDOMNode(result));

  if (dom instanceof Element) {
    mountInstanceInline(childInstance, dom);
    // Materialize key from component vnode onto the root element
    // This ensures keyed reconciliation works for lists of components
    materializeKey(dom, node, props);
    return dom;
  }

  // For null/undefined returns, use a comment placeholder that can be replaced
  // when the component re-renders with actual content. This is necessary for
  // portals and other components that may initially return null but later have content.
  if (!dom) {
    const placeholder = document.createComment('');
    // Store reference so we can find and replace it on re-render
    childInstance._placeholder = placeholder;
    childInstance.mounted = true;
    // Ensure notifyUpdate is set so the component can be re-rendered when content appears
    childInstance.notifyUpdate = childInstance._enqueueRun!;
    return placeholder;
  }

  // For non-Element returns (Text nodes or DocumentFragment), wrap in host
  const host = document.createElement('div');
  host.appendChild(dom);
  mountInstanceInline(childInstance, host);
  // Materialize key from component vnode onto the wrapper element
  materializeKey(host, node, props);
  return host;
}

/**
 * Create a document fragment from Fragment vnode
 */
function createFragmentElement(
  node: DOMElement,
  props: Record<string, unknown>
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const children = props.children || node.children;
  if (children) {
    if (Array.isArray(children)) {
      for (const child of children) {
        const dom = createDOMNode(child);
        if (dom) fragment.appendChild(dom);
      }
    } else {
      const dom = createDOMNode(children);
      if (dom) fragment.appendChild(dom);
    }
  }
  return fragment;
}

/**
 * Check if a cached DOM node can be reused for a given vnode.
 *
 * Returns true if shape has changed (i.e., DOM cannot be reused).
 * Structural check: compares DOM tagName with vnode type.
 * Do NOT rely on vnode identity (===) — vnodes are mutable.
 */
function checkVNodeShapeChanged(dom: Node, vnode: VNode): boolean {
  if (!_isDOMElement(vnode)) return true;
  if (!(dom instanceof Element)) return true;
  // Structural check: element type must match
  const vnodeType = (vnode as DOMElement).type;
  if (typeof vnodeType !== 'string') return true;
  return dom.tagName.toLowerCase() !== vnodeType.toLowerCase();
}

/**
 * Create DOM from For boundary - evaluates list and renders items
 *
 * CRITICAL INVARIANT:
 * DOM order MUST be reconstructed from the current vnode list on every render.
 * Reusing DOM nodes never implies preserving their position.
 *
 * This function ALWAYS returns a fragment whose child order exactly matches
 * the evaluated vnode list, even when all DOM nodes are reused.
 * Appending an existing node to the fragment is how we express reordering
 * (per DOM spec, appendChild moves already-attached nodes).
 *
 * Do NOT:
 * - Skip appending based on parentElement or existing attachment
 * - Rely on vnode identity (===) to decide DOM reuse (vnodes are mutable)
 * - Introduce fast-paths that might skip DOM reconstruction
 */
export function createForBoundary(
  node: DOMElement,
  props: Record<string, unknown>
): DocumentFragment {
  const forState = node._forState;

  if (!forState) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('[Askr] For boundary missing _forState');
    }
    return document.createDocumentFragment();
  }

  const source = props.source as unknown as
    | import('../runtime/state').State<unknown[]>
    | (() => unknown[]);
  const childrenVNodes = evaluateForState(forState, source);

  // DOM order MUST be reconstructed from the current vnode list on every render.
  // Reusing DOM nodes never implies preserving their position.
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < childrenVNodes.length; i++) {
    const childVNode = childrenVNodes[i];
    // Use orderedKeys[i] to look up items — this is aligned with vnode order
    // after reconciliation. Do NOT use childVNode.key (JSX key may differ).
    const itemKey = forState.orderedKeys[i];
    const itemInstance = itemKey != null ? forState.items.get(itemKey) : null;

    let dom: Node | null = null;

    // Try to reuse existing DOM if element type matches (structural check).
    // Do NOT rely on vnode identity (===) — vnodes are mutable.
    if (itemInstance && itemInstance._dom) {
      const cachedDom = itemInstance._dom;
      // Structural check: element type must match for safe reuse
      if (!checkVNodeShapeChanged(cachedDom, childVNode)) {
        dom = cachedDom;
      }
    }

    // Create new DOM if no reusable node available
    if (!dom) {
      dom = createDOMNode(childVNode);
      // Cache the DOM in the item instance for future reuse
      if (itemInstance) {
        itemInstance._dom = dom ?? undefined;
      }
    }

    if (dom) {
      // Always update reused DOM from current vnode (never rely on vnode identity)
      if (dom instanceof Element) {
        updateElementFromVnode(dom, childVNode, true);
      }

      // ALWAYS append to fragment — this is mandatory for correct ordering.
      // Appending an existing node moves it (DOM spec) — this is how reordering works.
      // No parentElement checks may gate insertion.
      fragment.appendChild(dom);
    }
  }

  return fragment;
}

// ─────────────────────────────────────────────────────────────────────────────
// Element Updates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update an existing element's attributes and children from vnode
 */
export function updateElementFromVnode(
  el: Element,
  vnode: VNode,
  updateChildren = true
): void {
  if (!_isDOMElement(vnode)) {
    return;
  }

  const props = (vnode.props || {}) as Record<string, unknown>;

  if (isHydrationSkipped(el)) {
    clearHydrationDeferredSubtree(el);
    return;
  }

  // Ensure key is materialized
  materializeKey(el, vnode, props);

  // Diff and update event listeners and other attributes
  const existingListeners = elementListeners.get(el);
  const existingReactiveProps = elementReactivePropsCleanup.get(el);
  // Lazily materialize desired event names only if we need to diff against existing listeners.
  // This avoids allocating a Set for the common case (no listeners, or no event props).
  let desiredEventNames: Set<string> | null = null;
  let desiredReactivePropNames: Set<string> | null = null;

  for (const key in props) {
    const value = props[key];
    if (isSkippedProp(key)) continue;

    const eventName = parseEventName(key);

    // Handle removal cases
    if (value === undefined || value === null || value === false) {
      if (key === 'class' || key === 'className') {
        el.className = '';
      } else if (eventName && existingListeners?.has(eventName)) {
        const entry = existingListeners.get(eventName)!;
        if (entry.isDelegated) {
          removeDelegatedListener(el, eventName);
        } else {
          if (entry.options !== undefined) {
            el.removeEventListener(eventName, entry.handler, entry.options);
          } else {
            el.removeEventListener(eventName, entry.handler);
          }
        }
        existingListeners.delete(eventName);
      } else if (existingReactiveProps?.has(key)) {
        existingReactiveProps.get(key)!.cleanup();
        existingReactiveProps.delete(key);
      } else {
        el.removeAttribute(key);
      }
      continue;
    }

    // Handle reactive props (functions)
    if (typeof value === 'function' && !eventName && key !== 'ref') {
      const existingEntry = existingReactiveProps?.get(key);
      if (existingReactiveProps && existingReactiveProps.size > 0) {
        (desiredReactivePropNames ??= new Set()).add(key);
      }

      // Only cleanup and re-setup if function reference changed (Issue 1 fix)
      if (existingEntry && existingEntry.fnRef === value) {
        // Same function reference, no need to re-setup
        continue;
      }

      // If function reference changed, cleanup old and setup new
      if (existingEntry) {
        existingEntry.cleanup();
      }

      const cleanup = setupReactiveProp(
        el,
        key,
        value as () => unknown,
        vnode.type as string
      );

      if (!elementReactivePropsCleanup.has(el)) {
        elementReactivePropsCleanup.set(el, new Map());
      }
      elementReactivePropsCleanup.get(el)!.set(key, {
        cleanup,
        fnRef: value as () => unknown,
      });
      continue;
    }

    if (existingReactiveProps?.has(key)) {
      existingReactiveProps.get(key)!.cleanup();
      existingReactiveProps.delete(key);
    }

    if (key === 'class' || key === 'className') {
      el.className = String(value);
    } else if (key === 'value' || key === 'checked') {
      (el as HTMLElement & Record<string, unknown>)[key] = value;
    } else if (eventName) {
      if (existingListeners && existingListeners.size > 0) {
        (desiredEventNames ??= new Set()).add(eventName);
      }

      const useDelegation =
        isEventDelegationEnabled() && isDelegatedEvent(eventName);
      const existing = existingListeners?.get(eventName);

      if (existing && existing.original === value) {
        continue;
      }

      if (existing) {
        if (existing.isDelegated) {
          removeDelegatedListener(el, eventName);
        } else {
          if (existing.options !== undefined) {
            el.removeEventListener(
              eventName,
              existing.handler,
              existing.options
            );
          } else {
            el.removeEventListener(eventName, existing.handler);
          }
        }
      }

      if (useDelegation) {
        addDelegatedListener(
          el,
          eventName,
          value as EventListener,
          value as EventListener,
          undefined
        );
      }

      const options = getPassiveOptions(eventName);
      const trackedHandler = useDelegation
        ? (value as EventListener)
        : createWrappedHandler(value as EventListener, true);

      if (!useDelegation) {
        if (options !== undefined) {
          el.addEventListener(eventName, trackedHandler, options);
        } else {
          el.addEventListener(eventName, trackedHandler);
        }
      }

      if (!elementListeners.has(el)) {
        elementListeners.set(el, new Map());
      }
      elementListeners.get(el)!.set(eventName, {
        handler: trackedHandler,
        original: value as EventListener,
        options,
        isDelegated: useDelegation,
      });
    } else {
      el.setAttribute(key, String(value));
    }
  }

  // Remove any remaining listeners not desired by current props
  if (existingListeners && existingListeners.size > 0) {
    // If no event props were present, all existing listeners are undesired.
    if (desiredEventNames === null) {
      for (const [eventName, entry] of existingListeners) {
        if (entry.isDelegated) {
          removeDelegatedListener(el, eventName);
        } else {
          if (entry.options !== undefined) {
            el.removeEventListener(eventName, entry.handler, entry.options);
          } else {
            el.removeEventListener(eventName, entry.handler);
          }
        }
      }
      elementListeners.delete(el);
    } else {
      for (const [eventName, entry] of existingListeners) {
        if (!desiredEventNames.has(eventName)) {
          if (entry.isDelegated) {
            removeDelegatedListener(el, eventName);
          } else {
            if (entry.options !== undefined) {
              el.removeEventListener(eventName, entry.handler, entry.options);
            } else {
              el.removeEventListener(eventName, entry.handler);
            }
          }
          existingListeners.delete(eventName);
        }
      }
      if (existingListeners.size === 0) elementListeners.delete(el);
    }
  }

  if (existingReactiveProps && existingReactiveProps.size > 0) {
    if (desiredReactivePropNames === null) {
      for (const [, entry] of existingReactiveProps) {
        entry.cleanup();
      }
      elementReactivePropsCleanup.delete(el);
    } else {
      for (const [key, entry] of existingReactiveProps) {
        if (!desiredReactivePropNames.has(key)) {
          entry.cleanup();
          existingReactiveProps.delete(key);
        }
      }
      if (existingReactiveProps.size === 0) {
        elementReactivePropsCleanup.delete(el);
      }
    }
  }

  // Update children
  if (updateChildren) {
    const children =
      vnode.children || (props.children as VNode | VNode[] | undefined);
    updateElementChildren(el, children);
  }
}

export function updateElementChildren(
  el: Element,
  children: VNode | VNode[] | undefined
): void {
  // CRITICAL: Check for null/undefined explicitly, not falsy values
  // because 0, false, and '' are valid children
  if (children === null || children === undefined) {
    // Clean up all children before clearing
    for (let n = el.firstChild; n; ) {
      const next = n.nextSibling;
      if (n instanceof Element) {
        teardownNodeSubtree(n);
      }
      n = next;
    }
    el.textContent = '';
    return;
  }

  if (
    !Array.isArray(children) &&
    (typeof children === 'string' || typeof children === 'number')
  ) {
    if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
      (el.firstChild as Text).data = String(children);
    } else {
      // Clean up all children before replacing with text
      for (let n = el.firstChild; n; ) {
        const next = n.nextSibling;
        if (n instanceof Element) {
          teardownNodeSubtree(n);
        }
        n = next;
      }
      el.textContent = String(children);
    }
    return;
  }

  // Handle For boundary wrapped in single-element array
  if (
    Array.isArray(children) &&
    children.length === 1 &&
    _isDOMElement(children[0]) &&
    (children[0] as DOMElement).type === __FOR_BOUNDARY__
  ) {
    // Evaluate For boundary and reconcile children
    const forVnode = children[0] as DOMElement;
    const forState = forVnode._forState;
    if (!forState) {
      throw new Error('[updateElementChildren] For boundary missing _forState');
    }
    const source = (forVnode.props || {}).source as unknown as
      | State<unknown[]>
      | (() => unknown[]);
    const childrenVNodes = evaluateForState(forState, source);
    const oldKeyMap = keyedElements.get(el);
    const newKeyMap = reconcileKeyedChildren(
      el,
      childrenVNodes as VNode[],
      oldKeyMap || new Map()
    );
    keyedElements.set(el, newKeyMap);
    return;
  }

  if (Array.isArray(children)) {
    updateUnkeyedChildren(el, children as unknown[]);
    return;
  }

  // Clean up all children before clearing
  for (let n = el.firstChild; n; ) {
    const next = n.nextSibling;
    if (n instanceof Element) {
      teardownNodeSubtree(n);
    }
    n = next;
  }
  el.textContent = '';
  const dom = createDOMNode(children);
  if (dom) el.appendChild(dom);
}

export function updateUnkeyedChildren(
  parent: Element,
  newChildren: unknown[]
): void {
  const existing = Array.from(parent.children);

  // Check if newChildren has mixed content (both text/primitives and elements)
  const hasText = newChildren.some(
    (c) => typeof c === 'string' || typeof c === 'number'
  );
  const hasElements = newChildren.some((c) => _isDOMElement(c));

  // If we have mixed content (text + elements), use childNodes instead of children
  // to handle both text nodes and elements properly
  if (hasText && hasElements) {
    const allNodes = Array.from(parent.childNodes);
    const max = Math.max(allNodes.length, newChildren.length);

    for (let i = 0; i < max; i++) {
      const currentNode = allNodes[i];
      const next = newChildren[i];

      // Remove extra existing nodes
      if (next === undefined && currentNode) {
        teardownNodeSubtree(currentNode);
        currentNode.remove();
        continue;
      }

      // Append new children beyond existing length
      if (!currentNode && next !== undefined) {
        const dom = createDOMNode(next);
        if (dom) parent.appendChild(dom);
        continue;
      }

      if (!currentNode || next === undefined) continue;

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
              updateElementFromVnode(currentEl, next);
            } else {
              // Different type - replace
              const dom = createDOMNode(next);
              if (dom) {
                teardownNodeSubtree(currentEl);
                parent.replaceChild(dom, currentNode);
              }
            }
          }
        } else {
          // Existing is text node - replace with element
          const dom = createDOMNode(next);
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
      if (n instanceof Element) {
        teardownNodeSubtree(n);
      }
      n = next;
    }
    parent.textContent = '';
  }
  const max = Math.max(existing.length, newChildren.length);

  for (let i = 0; i < max; i++) {
    const current = existing[i];
    const next = newChildren[i];

    // Remove extra existing children
    if (next === undefined && current) {
      // Clean up any component instance mounted on this node
      teardownNodeSubtree(current);
      current.remove();
      continue;
    }

    // Append new children beyond existing length
    if (!current && next !== undefined) {
      const dom = createDOMNode(next);
      if (dom) parent.appendChild(dom);
      continue;
    }

    if (!current || next === undefined) continue;

    // Update existing element based on next vnode/primitive
    if (typeof next === 'string' || typeof next === 'number') {
      // Clean up any element children before replacing with text
      if (current instanceof Element && current.childNodes.length > 0) {
        for (let n = current.firstChild; n; ) {
          const nextNode = n.nextSibling;
          if (n instanceof Element) {
            teardownNodeSubtree(n);
          }
          n = nextNode;
        }
      }
      current.textContent = String(next);
    } else if (_isDOMElement(next)) {
      if (typeof next.type === 'string') {
        // If element type matches, update in place; otherwise replace
        if (tagsEqualIgnoreCase(current.tagName, next.type)) {
          updateElementFromVnode(current, next);
        } else {
          const dom = createDOMNode(next);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      } else {
        // Non-string types: replace conservatively
        const dom = createDOMNode(next);
        if (dom) {
          teardownNodeSubtree(current);
          parent.replaceChild(dom, current);
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

/**
 * Positional update for keyed lists where keys changed en-masse but structure
 * (element tags and simple text children) remains identical. This updates
 * text content in-place and remaps the `data-key` attribute to the new key so
 * subsequent updates can find elements by their data-key.
 */
export function performBulkPositionalKeyedTextUpdate(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
) {
  const total = keyedVnodes.length;
  let reused = 0;
  let updatedKeys = 0;
  const t0 = now();
  const debugFastPath =
    process.env.ASKR_FASTPATH_DEBUG === '1' ||
    process.env.ASKR_FASTPATH_DEBUG === 'true';

  for (let i = 0; i < total; i++) {
    const { key, vnode } = keyedVnodes[i];
    const ch = parent.children[i] as Element | undefined;

    if (
      ch &&
      _isDOMElement(vnode) &&
      typeof (vnode as DOMElement).type === 'string'
    ) {
      const vnodeType = (vnode as DOMElement).type as string;

      if (tagsEqualIgnoreCase(ch.tagName, vnodeType)) {
        const children =
          (vnode as DOMElement).children ||
          (vnode as DOMElement).props?.children;

        if (debugFastPath) {
          logFastPathDebug('positional idx', i, {
            chTag: ch.tagName,
            vnodeType,
            chChildNodes: ch.childNodes.length,
            childrenType: Array.isArray(children) ? 'array' : typeof children,
          });
        }

        updateTextContent(ch, children, vnode as DOMElement);
        setDataKey(ch, key, () => updatedKeys++);
        reused++;
        continue;
      } else {
        if (debugFastPath) {
          logFastPathDebug('positional tag mismatch', i, {
            chTag: ch.tagName,
            vnodeType,
          });
        }
      }
    } else {
      if (debugFastPath) {
        logFastPathDebug('positional missing or invalid', i, { ch: !!ch });
      }
    }

    // Fallback: replace the node at position i
    replaceNodeAtPosition(parent, i, vnode);
  }

  const t = now() - t0;
  updateKeyedElementsMap(parent, keyedVnodes);

  const stats = { n: total, reused, updatedKeys, t } as const;
  recordFastPathStats(stats, 'bulkKeyedPositionalHits');

  return stats;
}

/** Update text content of element from children prop */
function updateTextContent(
  el: Element,
  children: unknown,
  vnode: DOMElement
): void {
  if (typeof children === 'string' || typeof children === 'number') {
    setTextNodeData(el, String(children));
    if (vnode.props && hasNonTrivialProps(vnode.props)) {
      updateElementFromVnode(el, vnode, false);
    }
  } else if (
    Array.isArray(children) &&
    children.length === 1 &&
    (typeof children[0] === 'string' || typeof children[0] === 'number')
  ) {
    setTextNodeData(el, String(children[0]));
    if (vnode.props && hasNonTrivialProps(vnode.props)) {
      updateElementFromVnode(el, vnode, false);
    }
  } else {
    // For more complex child shapes, try a small specialized text update before
    // falling back to a real vnode-driven update.
    if (!tryUpdateTwoChildTextPattern(el, vnode)) {
      updateElementFromVnode(el, vnode);
    }
  }
}

// Common keyed-list pattern in benches:
// <div> [ <span>text</span>, <p>text</p> ]
// Update text nodes in place without running a full vnode diff.
function tryUpdateTwoChildTextPattern(
  parentEl: Element,
  vnode: DOMElement
): boolean {
  const vnodeChildren = vnode.children || vnode.props?.children;
  if (!Array.isArray(vnodeChildren) || vnodeChildren.length !== 2) return false;

  const c0 = vnodeChildren[0];
  const c1 = vnodeChildren[1];
  if (!_isDOMElement(c0) || !_isDOMElement(c1)) return false;
  if (typeof c0.type !== 'string' || typeof c1.type !== 'string') return false;

  const el0 = parentEl.children[0] as Element | undefined;
  const el1 = parentEl.children[1] as Element | undefined;
  if (!el0 || !el1) return false;

  if (!tagsEqualIgnoreCase(el0.tagName, c0.type)) return false;
  if (!tagsEqualIgnoreCase(el1.tagName, c1.type)) return false;

  const t0 = (c0.children || c0.props?.children) as unknown;
  const t1 = (c1.children || c1.props?.children) as unknown;

  if (typeof t0 === 'string' || typeof t0 === 'number') {
    setTextNodeData(el0, String(t0));
  } else if (
    Array.isArray(t0) &&
    t0.length === 1 &&
    (typeof t0[0] === 'string' || typeof t0[0] === 'number')
  ) {
    setTextNodeData(el0, String(t0[0]));
  } else {
    return false;
  }

  if (typeof t1 === 'string' || typeof t1 === 'number') {
    setTextNodeData(el1, String(t1));
  } else if (
    Array.isArray(t1) &&
    t1.length === 1 &&
    (typeof t1[0] === 'string' || typeof t1[0] === 'number')
  ) {
    setTextNodeData(el1, String(t1[0]));
  } else {
    return false;
  }

  return true;
}

/** Set text node data or textContent */
function setTextNodeData(el: Element, text: string): void {
  if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
    (el.firstChild as Text).data = text;
  } else {
    el.textContent = text;
  }
}

/** Set data-key attribute with counter callback */
function setDataKey(
  el: Element,
  key: string | number,
  onSet: () => void
): void {
  try {
    const next = String(key);
    if (el.getAttribute('data-key') === next) return;
    el.setAttribute('data-key', next);
    onSet();
  } catch {
    // Ignore errors setting data-key
  }
}

function upperCommonTagName(tag: string): string | null {
  // Fast common tags (avoid per-iteration allocations).
  switch (tag) {
    case 'div':
      return 'DIV';
    case 'span':
      return 'SPAN';
    case 'p':
      return 'P';
    case 'a':
      return 'A';
    case 'button':
      return 'BUTTON';
    case 'input':
      return 'INPUT';
    case 'ul':
      return 'UL';
    case 'ol':
      return 'OL';
    case 'li':
      return 'LI';
    default:
      return null;
  }
}

function tagNamesEqualIgnoreCase(a: string, b: string): boolean {
  if (a === b) return true;
  const len = a.length;
  if (len !== b.length) return false;

  for (let i = 0; i < len; i++) {
    const ac = a.charCodeAt(i);
    const bc = b.charCodeAt(i);

    if (ac === bc) continue;

    // ASCII-only case fold; tag names are ASCII.
    const an = ac >= 65 && ac <= 90 ? ac + 32 : ac; // A-Z -> a-z
    const bn = bc >= 65 && bc <= 90 ? bc + 32 : bc;
    if (an !== bn) return false;
  }

  return true;
}

function tagsEqualIgnoreCase(
  elementTagName: string,
  vnodeType: string
): boolean {
  const upperCommon = upperCommonTagName(vnodeType);
  if (upperCommon !== null && elementTagName === upperCommon) return true;
  // Works for HTML and non-HTML elements without allocating.
  return tagNamesEqualIgnoreCase(elementTagName, vnodeType);
}

/** Replace node at position with new vnode */
function replaceNodeAtPosition(
  parent: Element,
  index: number,
  vnode: VNode
): void {
  const dom = createDOMNode(vnode);
  if (dom) {
    const existing = parent.children[index];
    if (existing) {
      teardownNodeSubtree(existing);
      parent.replaceChild(dom, existing);
    } else {
      parent.appendChild(dom);
    }
  }
}

/** Update keyed elements map after bulk operation */
function updateKeyedElementsMap(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
): void {
  try {
    // HOT PATH: reuse the existing map to avoid per-update allocations.
    const existing = keyedElements.get(parent);
    const newKeyMap = existing
      ? (existing.clear(), existing)
      : new Map<string | number, Element>();
    for (let i = 0; i < keyedVnodes.length; i++) {
      const k = keyedVnodes[i].key;
      const ch = parent.children[i] as Element | undefined;
      if (ch) newKeyMap.set(k, ch);
    }
    keyedElements.set(parent, newKeyMap);
  } catch {
    // Ignore errors updating key map
  }
}

export function performBulkTextReplace(parent: Element, newChildren: VNode[]) {
  const t0 = now();
  const existing = Array.from(parent.childNodes);
  const finalNodes: Node[] = [];
  let reused = 0;
  let created = 0;

  for (let i = 0; i < newChildren.length; i++) {
    const result = processChildNode(newChildren[i], existing[i], finalNodes);
    if (result === 'reused') reused++;
    else if (result === 'created') created++;
  }

  const tBuild = now() - t0;
  const tCommit = commitBulkReplace(parent, finalNodes);

  // Clear keyed map for unkeyed path
  keyedElements.delete(parent);

  const stats = {
    n: newChildren.length,
    reused,
    created,
    tBuild,
    tCommit,
  } as const;
  recordBulkTextStats(stats);

  return stats;
}

/** Process a single child vnode for bulk replace */
function processChildNode(
  vnode: VNode,
  existingNode: ChildNode | undefined,
  finalNodes: Node[]
): 'reused' | 'created' | 'skipped' {
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    return processTextVnode(String(vnode), existingNode, finalNodes);
  }

  if (typeof vnode === 'object' && vnode !== null && 'type' in vnode) {
    return processElementVnode(vnode, existingNode, finalNodes);
  }

  return 'skipped';
}

/** Process text vnode */
function processTextVnode(
  text: string,
  existingNode: ChildNode | undefined,
  finalNodes: Node[]
): 'reused' | 'created' {
  if (existingNode && existingNode.nodeType === 3) {
    (existingNode as Text).data = text;
    finalNodes.push(existingNode);
    return 'reused';
  }
  finalNodes.push(document.createTextNode(text));
  return 'created';
}

/** Process element vnode */
function processElementVnode(
  vnode: VNode,
  existingNode: ChildNode | undefined,
  finalNodes: Node[]
): 'reused' | 'created' | 'skipped' {
  const vnodeObj = vnode as unknown as { type?: unknown };

  if (typeof vnodeObj.type === 'string') {
    const tag = vnodeObj.type;
    if (
      existingNode &&
      existingNode.nodeType === 1 &&
      tagsEqualIgnoreCase((existingNode as Element).tagName, tag)
    ) {
      updateElementFromVnode(existingNode as Element, vnode);
      finalNodes.push(existingNode);
      return 'reused';
    }
  }

  const dom = createDOMNode(vnode);
  if (dom) {
    finalNodes.push(dom);
    return 'created';
  }
  return 'skipped';
}

/** Clean up nodes that will be removed */
/** Commit bulk replace with fragment */
function commitBulkReplace(parent: Element, nodes: Node[]): number {
  const fragStart = Date.now();
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < nodes.length; i++) {
    fragment.appendChild(nodes[i]);
  }

  // Cleanup nodes that will be removed.
  // At this point, any reused nodes have been moved into the fragment, so
  // whatever remains under `parent` will be removed by replaceChildren.
  try {
    for (let n = parent.firstChild; n; ) {
      const next = n.nextSibling;
      teardownNodeSubtree(n);
      n = next;
    }
  } catch {
    // SLOW PATH: cleanup failure
  }

  recordDOMReplace('bulk-text-replace');
  parent.replaceChildren(fragment);
  return Date.now() - fragStart;
}

/** Record bulk text fast-path stats */
function recordBulkTextStats(stats: {
  n: number;
  reused: number;
  created: number;
  tBuild: number;
  tCommit: number;
}): void {
  try {
    setDevValue('__LAST_BULK_TEXT_FASTPATH_STATS', stats);
    setDevValue('__LAST_FASTPATH_STATS', stats);
    setDevValue('__LAST_FASTPATH_COMMIT_COUNT', 1);
    incDevCounter('bulkTextFastpathHits');
  } catch {
    // Ignore stats errors
  }
}

/**
 * Heuristic to detect large bulk text-dominant updates eligible for fast-path.
 * Conditions:
 *  - total children >= threshold
 *  - majority of children are simple text (string/number) or intrinsic elements
 *    with a single primitive child
 *  - conservative: avoid when component children or complex shapes present
 */
export function isBulkTextFastPathEligible(
  parent: Element,
  newChildren: VNode[]
) {
  const threshold = Number(process.env.ASKR_BULK_TEXT_THRESHOLD) || 1024;
  const requiredFraction = 0.8;

  const total = Array.isArray(newChildren) ? newChildren.length : 0;

  if (total < threshold) {
    recordBulkDiag({
      phase: 'bulk-unkeyed-eligible',
      reason: 'too-small',
      total,
      threshold,
    });
    return false;
  }

  const result = countSimpleChildren(newChildren);
  if (result.componentFound !== undefined) {
    recordBulkDiag({
      phase: 'bulk-unkeyed-eligible',
      reason: 'component-child',
      index: result.componentFound,
    });
    return false;
  }

  const fraction = result.simple / total;
  const eligible =
    fraction >= requiredFraction && parent.childNodes.length >= total;

  recordBulkDiag({
    phase: 'bulk-unkeyed-eligible',
    total,
    simple: result.simple,
    fraction,
    requiredFraction,
    eligible,
  });

  return eligible;
}

/** Count simple children (text/number or simple intrinsic elements) */
function countSimpleChildren(children: VNode[]): {
  simple: number;
  componentFound?: number;
} {
  let simple = 0;

  for (let i = 0; i < children.length; i++) {
    const c = children[i];

    if (typeof c === 'string' || typeof c === 'number') {
      simple++;
      continue;
    }

    if (typeof c === 'object' && c !== null && 'type' in c) {
      const dv = c as DOMElement;

      // Component child - decline fast path
      if (typeof dv.type === 'function') {
        return { simple, componentFound: i };
      }

      if (typeof dv.type === 'string' && isSimpleElement(dv)) {
        simple++;
      }
    }
  }

  return { simple };
}

/** Check if element is simple (empty or single text child) */
function isSimpleElement(dv: DOMElement): boolean {
  const children = dv.children || dv.props?.children;

  // CRITICAL: Check for null/undefined explicitly, not falsy values
  // because 0, false, and '' are valid children that should return true (simple)
  if (children === null || children === undefined) return true; // empty element

  if (typeof children === 'string' || typeof children === 'number') {
    return true;
  }

  if (
    Array.isArray(children) &&
    children.length === 1 &&
    (typeof children[0] === 'string' || typeof children[0] === 'number')
  ) {
    return true;
  }

  return false;
}

/** Record bulk diagnostics */
function recordBulkDiag(data: Record<string, unknown>): void {
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.ASKR_FASTPATH_DEBUG === '1'
  ) {
    try {
      setDevValue('__BULK_DIAG', data);
    } catch {
      // Ignore
    }
  }
}
