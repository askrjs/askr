import { logger } from '../dev/logger';
import { getRuntimeEnv } from './env';
import type { Props } from '../common/props';
import type { ComponentInstance } from '../runtime/component';
import type { ComponentFunction } from '../runtime/component';
import {
  elementListeners,
  removeAllListeners,
  cleanupInstanceIfPresent,
} from './cleanup';
import { keyedElements } from './keyed';
import { reconcileKeyedChildren } from './reconcile';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { __FOR_BOUNDARY__ } from '../common/vnode';
import { evaluateForState } from '../runtime/for';
import {
  evaluateCaseState,
  evaluateShowState,
  type ControlBoundaryState,
} from '../runtime/control';
import {
  createDOMNode,
  commitForBoundaryChildren,
  syncComponentElement,
  updateElementFromVnode,
  updateUnkeyedChildren,
  performBulkPositionalKeyedTextUpdate,
  performBulkTextReplace,
  isBulkTextFastPathEligible,
} from './dom';
import { setDevValue, incDevCounter } from '../runtime/dev-namespace';
import { Fragment } from '../common/jsx';
import {
  createWrappedHandler,
  extractKey,
  getEventListenerKey,
  getEventListenerOptions,
  parseEventProp,
  setRenderedAttribute,
  tagNamesEqualIgnoreCase as sharedTagNamesEqualIgnoreCase,
  writeElementClassName,
} from './utils';

/**
 * Internal marker for component-owned DOM ranges
 * Allows efficient partial DOM updates instead of clearing entire target
 */
interface DOMRange {
  start: Node; // Start marker (comment node)
  end: Node; // End marker (comment node)
}

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function resolveChildNamespace(
  type: string,
  parentNamespace?: string
): string | undefined {
  if (type === 'svg') return SVG_NAMESPACE;
  if (parentNamespace === SVG_NAMESPACE && type !== 'foreignObject') {
    return SVG_NAMESPACE;
  }
  return undefined;
}

function createElementForNamespace(
  type: string,
  parentNamespace?: string
): Element {
  const namespace = resolveChildNamespace(type, parentNamespace);
  return namespace
    ? document.createElementNS(namespace, type)
    : document.createElement(type);
}

const domRanges = new WeakMap<object, DOMRange>();

type ComponentHostElement = Element & {
  __ASKR_INSTANCE?: ComponentInstance;
  __ASKR_INSTANCES?: ComponentInstance[];
};

function getRetainedHostOwnerChain(
  host: ComponentHostElement,
  owner: ComponentInstance
): ComponentInstance[] {
  const instances = host.__ASKR_INSTANCES ?? [];
  const ownerIndex = instances.indexOf(owner);

  return ownerIndex >= 0 ? instances.slice(ownerIndex) : [owner];
}

function retainHostOwnerChain(
  host: Element,
  owner: ComponentInstance,
  retainedInstances: ComponentInstance[]
): void {
  const componentHost = host as ComponentHostElement;
  const existing = componentHost.__ASKR_INSTANCES ?? [];
  const nextInstances = [...existing];

  for (const instance of retainedInstances) {
    if (!nextInstances.includes(instance)) {
      nextInstances.push(instance);
    }
  }

  componentHost.__ASKR_INSTANCES = nextInstances;
  componentHost.__ASKR_INSTANCE = owner;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Types & Utilities
// ─────────────────────────────────────────────────────────────────────────────

interface SimpleTextResult {
  isSimple: true;
  text: string;
}

interface NotSimpleTextResult {
  isSimple: false;
  text?: undefined;
}

type TextCheckResult = SimpleTextResult | NotSimpleTextResult;

function tagNamesEqualIgnoreCase(a: string, b: string): boolean {
  return sharedTagNamesEqualIgnoreCase(a, b);
}

/**
 * Check if vnode children represent a simple text value
 */
function checkSimpleText(vnodeChildren: unknown): TextCheckResult {
  if (!Array.isArray(vnodeChildren)) {
    if (
      typeof vnodeChildren === 'string' ||
      typeof vnodeChildren === 'number'
    ) {
      return { isSimple: true, text: String(vnodeChildren) };
    }
  } else if (vnodeChildren.length === 1) {
    const child = vnodeChildren[0];
    if (typeof child === 'string' || typeof child === 'number') {
      return { isSimple: true, text: String(child) };
    }
  }
  return { isSimple: false };
}

/**
 * Try to update a single text node in place
 * Returns true if update was performed, false otherwise
 */
function tryUpdateTextInPlace(element: Element, text: string): boolean {
  if (
    element.childNodes.length === 1 &&
    element.firstChild?.nodeType === 3 // TEXT_NODE
  ) {
    (element.firstChild as Text).data = text;
    return true;
  }
  return false;
}

/**
 * Build a key map from existing DOM children
 */
function buildKeyMapFromDOM(parent: Element): Map<string | number, Element> {
  const keyMap = new Map<string | number, Element>();
  for (
    let child = parent.firstElementChild;
    child;
    child = child.nextElementSibling
  ) {
    const k = child.getAttribute('data-key');
    if (k !== null) {
      keyMap.set(k, child);
      const n = Number(k);
      if (!Number.isNaN(n)) keyMap.set(n, child);
    }
  }
  return keyMap;
}

/**
 * Get or initialize key map for an element
 */
function getOrBuildKeyMap(
  parent: Element
): Map<string | number, Element> | undefined {
  let keyMap = keyedElements.get(parent);
  if (!keyMap) {
    keyMap = buildKeyMapFromDOM(parent);
    if (keyMap.size > 0) {
      keyedElements.set(parent, keyMap);
    }
  }
  return keyMap.size > 0 ? keyMap : undefined;
}

/**
 * Check if children array contains keyed elements
 */
function hasKeyedChildren(children: unknown[]): boolean {
  for (let i = 0; i < children.length; i++) {
    if (extractKey(children[i]) !== undefined) return true;
  }
  return false;
}

/**
 * Track bulk text fast-path stats (dev only)
 */
function trackBulkTextStats(
  stats: ReturnType<typeof performBulkTextReplace>
): void {
  if (getRuntimeEnv().NODE_ENV !== 'production') {
    try {
      setDevValue('__LAST_BULK_TEXT_FASTPATH_STATS', stats);
      incDevCounter('bulkTextHits');
    } catch {
      // ignore
    }
  }
}

/**
 * Track bulk text miss (dev only)
 */
function trackBulkTextMiss(): void {
  if (getRuntimeEnv().NODE_ENV !== 'production') {
    try {
      incDevCounter('bulkTextMisses');
    } catch {
      // ignore
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Child Reconciliation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconcile keyed children with optional forced bulk path
 */
function reconcileKeyed(
  parent: Element,
  children: VNode[],
  oldKeyMap: Map<string | number, Element> | undefined
): void {
  // Optional forced positional bulk path for large keyed lists
  if (getRuntimeEnv().ASKR_FORCE_BULK_POSREUSE === '1') {
    const result = tryForcedBulkKeyedPath(parent, children);
    if (result) return;
  }

  // Standard keyed reconciliation
  const newKeyMap = reconcileKeyedChildren(parent, children, oldKeyMap);
  keyedElements.set(parent, newKeyMap);
}

/**
 * Try the forced bulk keyed positional path
 * Returns true if applied, false to fall back to normal reconciliation
 */
function tryForcedBulkKeyedPath(parent: Element, children: VNode[]): boolean {
  try {
    const keyedVnodes: Array<{ key: string | number; vnode: VNode }> = [];
    for (const child of children) {
      const key = extractKey(child);
      if (_isDOMElement(child) && key !== undefined) {
        keyedVnodes.push({
          key,
          vnode: child,
        });
      }
    }

    // Only apply when all children are keyed and count matches
    if (keyedVnodes.length === 0 || keyedVnodes.length !== children.length) {
      return false;
    }

    const fastPathEnv = getRuntimeEnv();
    if (
      fastPathEnv.ASKR_FASTPATH_DEBUG === '1' ||
      fastPathEnv.ASKR_FASTPATH_DEBUG === 'true'
    ) {
      logger.warn(
        '[Askr][FASTPATH] forced positional bulk keyed reuse (evaluate-level)'
      );
    }

    const stats = performBulkPositionalKeyedTextUpdate(parent, keyedVnodes);

    const statsEnv = getRuntimeEnv();
    if (
      statsEnv.NODE_ENV !== 'production' ||
      statsEnv.ASKR_FASTPATH_DEBUG === '1'
    ) {
      try {
        setDevValue('__LAST_FASTPATH_STATS', stats);
        setDevValue('__LAST_FASTPATH_COMMIT_COUNT', 1);
        incDevCounter('bulkKeyedPositionalForced');
      } catch {
        // ignore
      }
    }

    // Rebuild keyed map from DOM
    const newMap = buildKeyMapFromDOM(parent);
    keyedElements.set(parent, newMap);
    return true;
  } catch (err) {
    const fallbackEnv = getRuntimeEnv();
    if (
      fallbackEnv.ASKR_FASTPATH_DEBUG === '1' ||
      fallbackEnv.ASKR_FASTPATH_DEBUG === 'true'
    ) {
      logger.warn(
        '[Askr][FASTPATH] forced bulk path failed, falling back',
        err
      );
    }
    return false;
  }
}

/**
 * Reconcile unkeyed children, using bulk fast-path when eligible
 */
function reconcileUnkeyed(parent: Element, children: VNode[]): void {
  if (isBulkTextFastPathEligible(parent, children)) {
    const stats = performBulkTextReplace(parent, children);
    trackBulkTextStats(stats);
  } else {
    trackBulkTextMiss();
    updateUnkeyedChildren(parent, children);
  }
  keyedElements.delete(parent);
}

/**
 * Update element children from a For boundary vnode
 * Evaluates the For and reconciles the keyed children with existing DOM
 */
function updateForBoundaryChildren(
  element: Element,
  forVnode: DOMElement
): void {
  const controlState =
    forVnode._controlState ??
    (forVnode._forState as ControlBoundaryState | undefined);
  if (!controlState) return;

  const childrenVNodes =
    controlState.kind === 'for'
      ? evaluateForState(controlState)
      : controlState.kind === 'show'
        ? evaluateShowState(controlState)
        : evaluateCaseState(controlState);
  commitForBoundaryChildren(element, controlState, childrenVNodes);
}

/**
 * Update element children (handles keyed, unkeyed, For boundaries, and non-array cases)
 */
function updateElementChildren(element: Element, vnodeChildren: unknown): void {
  // CRITICAL: Check for null/undefined explicitly, not falsy values
  // because 0, false, and '' are valid children
  if (vnodeChildren === null || vnodeChildren === undefined) {
    // Clean up all children before clearing
    for (let n = element.firstChild; n; ) {
      const next = n.nextSibling;
      if (n instanceof Element) {
        removeAllListeners(n);
        cleanupInstanceIfPresent(n);
      }
      n = next;
    }
    element.textContent = '';
    keyedElements.delete(element);
    return;
  }

  // Handle For boundary as a special single-child case (non-array)
  if (
    !Array.isArray(vnodeChildren) &&
    _isDOMElement(vnodeChildren) &&
    (vnodeChildren as DOMElement).type === __FOR_BOUNDARY__
  ) {
    updateForBoundaryChildren(element, vnodeChildren as DOMElement);
    return;
  }

  if (!Array.isArray(vnodeChildren) && isFragment(vnodeChildren)) {
    updateElementChildren(element, getFragmentChildren(vnodeChildren));
    return;
  }

  if (!Array.isArray(vnodeChildren)) {
    // Clean up all children before clearing
    for (let n = element.firstChild; n; ) {
      const next = n.nextSibling;
      if (n instanceof Element) {
        removeAllListeners(n);
        cleanupInstanceIfPresent(n);
      }
      n = next;
    }
    element.textContent = '';
    const dom = createDOMNode(vnodeChildren);
    if (dom) element.appendChild(dom);
    keyedElements.delete(element);
    return;
  }

  // Handle For boundary wrapped in a single-element array [forVnode]
  // This is common when JSX transpiles children as arrays
  if (
    vnodeChildren.length === 1 &&
    _isDOMElement(vnodeChildren[0]) &&
    (vnodeChildren[0] as DOMElement).type === __FOR_BOUNDARY__
  ) {
    updateForBoundaryChildren(element, vnodeChildren[0] as DOMElement);
    return;
  }

  if (hasKeyedChildren(vnodeChildren)) {
    const oldKeyMap = getOrBuildKeyMap(element);
    try {
      reconcileKeyed(element, vnodeChildren, oldKeyMap);
    } catch {
      // Fall back on error
      const newKeyMap = reconcileKeyedChildren(
        element,
        vnodeChildren,
        oldKeyMap
      );
      keyedElements.set(element, newKeyMap);
    }
  } else {
    reconcileUnkeyed(element, vnodeChildren);
  }
}

/**
 * Perform a smart update on an existing element
 * Tries text-in-place update first, then full child reconciliation
 */
function smartUpdateElement(element: Element, vnode: DOMElement): void {
  if (vnode.key == null && element.hasAttribute('data-key')) {
    const existingKey = element.getAttribute('data-key');
    if (existingKey !== null) {
      const numericKey = Number(existingKey);
      vnode.key = Number.isNaN(numericKey) ? existingKey : numericKey;
    }
  }

  let vnodeChildren = vnode.props?.children ?? vnode.children;

  // CRITICAL: For boundary vnodes must NOT be wrapped into an array
  // They need special handling in updateElementChildren to call updateForBoundaryChildren
  if (
    vnodeChildren &&
    _isDOMElement(vnodeChildren) &&
    (vnodeChildren as DOMElement).type === __FOR_BOUNDARY__
  ) {
    // Pass For boundary directly without wrapping
    updateElementChildren(element, vnodeChildren);
    updateElementFromVnode(element, vnode, false);
    return;
  }

  // Normalize: if children is a single vnode (not an array), wrap it
  if (vnodeChildren && !Array.isArray(vnodeChildren)) {
    vnodeChildren = [vnodeChildren];
  }

  const textCheck = checkSimpleText(vnodeChildren);

  if (textCheck.isSimple && tryUpdateTextInPlace(element, textCheck.text)) {
    // Text updated in place, nothing more to do for children
  } else {
    updateElementChildren(element, vnodeChildren);
  }

  updateElementFromVnode(element, vnode, false);
}

/**
 * Process Fragment children with smart updates for each child
 */
function processFragmentChildren(target: Element, childArray: unknown[]): void {
  updateElementChildren(target, childArray);
}

function cleanupRangeNode(node: Node): void {
  if (node instanceof Element) {
    removeAllListeners(node);
    cleanupInstanceIfPresent(node);
  }
}

function updateDOMRange(
  target: Element,
  range: DOMRange,
  children: unknown[]
): void {
  let current: Node | null = range.start.nextSibling;

  for (let i = 0; i < children.length; i++) {
    const nextChild = children[i];
    const currentNode = current === range.end ? null : current;
    const nextCurrent = currentNode?.nextSibling ?? null;

    if (nextChild === null || nextChild === undefined || nextChild === false) {
      if (currentNode) {
        cleanupRangeNode(currentNode);
        target.removeChild(currentNode);
      }
      current = nextCurrent;
      continue;
    }

    if (typeof nextChild === 'string' || typeof nextChild === 'number') {
      if (currentNode?.nodeType === 3) {
        (currentNode as Text).data = String(nextChild);
      } else {
        const textNode = document.createTextNode(String(nextChild));
        if (currentNode) {
          cleanupRangeNode(currentNode);
          target.replaceChild(textNode, currentNode);
        } else {
          target.insertBefore(textNode, range.end);
        }
      }
      current = nextCurrent;
      continue;
    }

    if (
      currentNode instanceof Element &&
      _isDOMElement(nextChild) &&
      typeof nextChild.type === 'string' &&
      tagNamesEqualIgnoreCase(currentNode.tagName, nextChild.type)
    ) {
      smartUpdateElement(currentNode, nextChild);
      current = nextCurrent;
      continue;
    }

    const newDom = createDOMNode(nextChild);
    if (!newDom) {
      if (currentNode) {
        cleanupRangeNode(currentNode);
        target.removeChild(currentNode);
      }
      current = nextCurrent;
      continue;
    }

    if (currentNode) {
      cleanupRangeNode(currentNode);
      target.replaceChild(newDom, currentNode);
    } else {
      target.insertBefore(newDom, range.end);
    }

    current = nextCurrent;
  }

  while (current && current !== range.end) {
    const next = current.nextSibling;
    cleanupRangeNode(current);
    target.removeChild(current);
    current = next;
  }
}

/**
 * Apply props/attributes to an element (used for first render with keyed children)
 */
function applyPropsToElement(el: Element, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || key === 'key') continue;
    if (value === undefined || value === null || value === false) continue;

    if (key === 'ref') {
      applyRef(el, value);
      continue;
    }

    const eventProp = parseEventProp(key);
    if (eventProp) {
      const { eventName, capture } = eventProp;
      const wrappedHandler = createWrappedHandler(value as EventListener, true);
      const options = getEventListenerOptions(eventName, capture);
      const listenerKey = getEventListenerKey(eventName, capture);

      if (options !== undefined)
        el.addEventListener(eventName, wrappedHandler, options);
      else el.addEventListener(eventName, wrappedHandler);

      if (!elementListeners.has(el)) elementListeners.set(el, new Map());
      elementListeners.get(el)!.set(listenerKey, {
        handler: wrappedHandler,
        original: value as EventListener,
        eventName,
        options,
      });
      continue;
    }

    if (key === 'class' || key === 'className') {
      writeElementClassName(el, String(value));
    } else if (key === 'value' || key === 'checked') {
      (el as HTMLElement & Props)[key] = value;
    } else {
      setRenderedAttribute(el, key, String(value));
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
  try {
    (r as { current: T | null }).current = el;
  } catch {
    // Ignore write failures
  }
}

/**
 * Try to handle first render of element with keyed children
 * Returns true if handled, false to fall back to default rendering
 */
function tryFirstRenderKeyedChildren(
  target: Element,
  vnode: DOMElement
): boolean {
  const children = vnode.children;
  if (!Array.isArray(children) || !hasKeyedChildren(children)) {
    return false;
  }

  const el = createElementForNamespace(
    vnode.type as string,
    target.namespaceURI === SVG_NAMESPACE ? SVG_NAMESPACE : undefined
  );
  target.appendChild(el);

  applyPropsToElement(el, vnode.props || {});

  const newKeyMap = reconcileKeyedChildren(el, children, undefined);
  keyedElements.set(el, newKeyMap);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fragment Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a vnode is a Fragment
 */
function isFragment(vnode: unknown): vnode is DOMElement {
  return (
    _isDOMElement(vnode) &&
    typeof (vnode as DOMElement).type === 'symbol' &&
    ((vnode as DOMElement).type === Fragment ||
      String((vnode as DOMElement).type) === 'Symbol(askr.fragment)')
  );
}

/**
 * Unwrap Fragment to get children array
 */
function getFragmentChildren(vnode: DOMElement): unknown[] {
  const fragmentChildren = vnode.props?.children ?? vnode.children ?? [];
  return Array.isArray(fragmentChildren)
    ? fragmentChildren
    : [fragmentChildren];
}

export function evaluate(
  node: unknown,
  target: Element | null,
  context?: object,
  retainedOwner?: ComponentInstance
): void {
  if (!target) return;
  // SSR guard: avoid DOM ops when not in a browser-like environment
  if (typeof document === 'undefined') {
    if (getRuntimeEnv().NODE_ENV !== 'production') {
      try {
        // Keep this lightweight and non-throwing so test harnesses and SSR
        // imports don't crash at runtime; callers should avoid calling
        // `evaluate` in SSR, but we make it safe as a no-op.
        console.warn('[Askr] evaluate() called in non-DOM environment; no-op.');
      } catch (e) {
        void e;
      }
    }
    return;
  }
  // Debug tracing to help understand why initial mounts sometimes don't
  // result in DOM mutations during tests.

  // If context provided, use component-owned DOM range (only replace that range)
  if (context && domRanges.has(context)) {
    const range = domRanges.get(context)!;
    const normalizedChildren =
      node === null || node === undefined || node === false
        ? []
        : isFragment(node)
          ? getFragmentChildren(node as DOMElement)
          : Array.isArray(node)
            ? node
            : [node];

    updateDOMRange(target, range, normalizedChildren);
  } else if (context) {
    // First render with context: create range markers
    const start = document.createComment('component-start');
    const end = document.createComment('component-end');
    target.appendChild(start);
    target.appendChild(end);
    domRanges.set(context, { start, end });
    // Render into the range
    const dom = createDOMNode(node);
    if (dom) {
      target.insertBefore(dom, end);
    }
  } else {
    // Root render (no context): smart update strategy
    // If target has exactly one child of the same element type as the vnode,
    // reuse the element and just update its content.
    // This preserves the element reference and event handlers across renders.

    let vnode = node;

    // If vnode is a Fragment, unwrap it to get the actual content for the smart update path.
    // Fragments become invisible in the DOM - their children are placed directly in the parent.
    // So for smart updates, we need to compare against the Fragment's children, not the Fragment itself.
    if (isFragment(vnode)) {
      const childArray = getFragmentChildren(vnode as DOMElement);
      // If Fragment has exactly one child that's an element, unwrap to that child
      // This allows the smart update path to match against it
      if (
        childArray.length === 1 &&
        _isDOMElement(childArray[0]) &&
        typeof (childArray[0] as DOMElement).type === 'string'
      ) {
        vnode = childArray[0];
      } else {
        // Fragment with multiple children - process each child with full smart update logic
        processFragmentChildren(target, childArray);
        return;
      }
    }

    if (
      _isDOMElement(vnode) &&
      (vnode as DOMElement).type === __FOR_BOUNDARY__
    ) {
      updateForBoundaryChildren(target, vnode as DOMElement);
      return;
    }

    if (Array.isArray(vnode)) {
      updateElementChildren(target, vnode);
      return;
    }

    // CRITICAL FIX: Check if target itself matches the vnode type AND target is the component's own element
    // This handles inline-rendered components where target IS the component's element.
    // For root components, target is a container (not the component's rendered element), so we skip this path.
    // We detect this by checking if the instance's target property points to this same element.
    const targetWithInstance = target as Element & {
      __ASKR_INSTANCE?: ComponentInstance;
    };
    const targetInstance =
      retainedOwner?.target === target
        ? retainedOwner
        : targetWithInstance.__ASKR_INSTANCE;
    if (targetInstance && targetInstance.target === target) {
      const retainedHostInstances = getRetainedHostOwnerChain(
        targetWithInstance,
        targetInstance
      );

      // This is a nested component's own element.
      if (_isDOMElement(vnode) && typeof vnode.type === 'function') {
        const syncedDom = syncComponentElement(
          target,
          vnode as DOMElement,
          vnode.type as ComponentFunction,
          (((vnode as DOMElement).props ?? {}) as Record<string, unknown>) ||
            {},
          undefined,
          false,
          retainedHostInstances
        );

        if (syncedDom instanceof Element) {
          retainHostOwnerChain(syncedDom, targetInstance, retainedHostInstances);
          targetInstance.target = syncedDom;
          return;
        }
      }

      if (
        _isDOMElement(vnode) &&
        typeof vnode.type === 'string' &&
        tagNamesEqualIgnoreCase(target.tagName, vnode.type)
      ) {
        // Tag names match - update in place
        smartUpdateElement(target, vnode as DOMElement);
        return;
      }

      // Tag names don't match - need to replace the element
      // Create new element and replace old one in parent
      const newDom = createDOMNode(vnode);
      if (newDom && target.parentNode) {
        // Transfer the component instance to the new element
        if (newDom instanceof Element) {
          (
            newDom as Element & { __ASKR_INSTANCE?: ComponentInstance }
          ).__ASKR_INSTANCE = targetInstance;
          targetInstance.target = newDom as Element;
        }
        // Clean up old element
        removeAllListeners(target);
        target.parentNode.replaceChild(newDom, target);
        return;
      }
    }

    const firstChild = target.children[0] as Element | undefined;

    if (
      firstChild &&
      _isDOMElement(vnode) &&
      typeof vnode.type === 'string' &&
      tagNamesEqualIgnoreCase(firstChild.tagName, vnode.type)
    ) {
      // Reuse the existing element - it's the same type
      smartUpdateElement(firstChild, vnode as DOMElement);
    } else {
      // Clear and rebuild (first render or structure changed)
      target.textContent = '';

      // Check if this is an element with keyed children even on first render
      if (
        _isDOMElement(vnode) &&
        typeof vnode.type === 'string' &&
        tryFirstRenderKeyedChildren(target, vnode as DOMElement)
      ) {
        return;
      }

      // Default: create whole tree
      const dom = createDOMNode(vnode);
      if (dom) {
        target.appendChild(dom);
      }
    }
  }
}

export function clearDOMRange(context: object): void {
  domRanges.delete(context);
}
