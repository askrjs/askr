import { cleanupComponent, type ComponentInstance } from '../runtime';
import { registerLifecycleTransaction } from '../runtime';
import { logger } from '../common/logger';
import { incDevCounter } from '../runtime';
import {
  clearDelegatedHandlersForElement,
  removeDelegatedListener,
} from '../runtime';

type InstanceHost = Node & {
  __ASKR_INSTANCE?: unknown;
  __ASKR_INSTANCES?: unknown[];
};

type Ref<T> =
  | ((value: T | null) => void)
  | { current: T | null }
  | null
  | undefined;

export const elementRefs = new WeakMap<Element, unknown>();
// Ref ownership is lookup-only. Keeping it weak prevents an obsolete inline
// callback ref from becoming a permanent strong root for its former element.
const refOwners = new WeakMap<object, Element>();

function isRefOwnerKey(ref: unknown): ref is object {
  return typeof ref === 'function' || (typeof ref === 'object' && ref !== null);
}

/** @internal Return the current exact owner for ref reconciliation. */
export function getElementRefOwner(ref: unknown): Element | undefined {
  return isRefOwnerKey(ref) ? refOwners.get(ref) : undefined;
}

/** @internal Synchronize ref registries without invoking user callbacks. */
export function replaceElementRefBookkeeping(
  element: Element,
  ref: unknown
): void {
  const previousRef = elementRefs.get(element);
  if (isRefOwnerKey(previousRef) && refOwners.get(previousRef) === element) {
    refOwners.delete(previousRef);
  }

  if (ref) {
    elementRefs.set(element, ref);
    if (isRefOwnerKey(ref)) {
      refOwners.set(ref, element);
    }
  } else {
    elementRefs.delete(element);
  }
}

function applyRefValue<T>(ref: unknown, value: T | null): void {
  const resolvedRef = ref as Ref<T>;

  if (!resolvedRef) {
    return;
  }

  if (typeof resolvedRef === 'function') {
    resolvedRef(value);
    return;
  }

  if (Object.isExtensible(resolvedRef)) {
    (resolvedRef as { current: T | null }).current = value;
  }
}

export function updateElementRef<T extends Element>(
  element: T,
  ref: unknown
): void {
  const transactionKey = {};
  if (
    registerLifecycleTransaction(
      transactionKey,
      () => updateElementRefImmediately(element, ref),
      () => undefined
    )
  ) {
    return;
  }

  updateElementRefImmediately(element, ref);
}

function updateElementRefImmediately<T extends Element>(
  element: T,
  ref: unknown
): void {
  const previousRef = elementRefs.get(element);

  if (previousRef === ref) {
    return;
  }

  if (previousRef) {
    applyRefValue(previousRef, null);
    if (getElementRefOwner(previousRef) === element) {
      refOwners.delete(previousRef as object);
    }
  }

  if (ref) {
    const previousOwner = getElementRefOwner(ref);
    if (
      typeof ref === 'function' &&
      previousOwner &&
      previousOwner !== element
    ) {
      // Keep callback-ref ordering deterministic when a replacement is
      // staged in the same lifecycle batch: old owner gets null first, then
      // the callback is reattached to the new owner by its teardown.
      elementRefs.set(element, ref);
      refOwners.set(ref, element);
      return;
    }

    applyRefValue(ref, element);
    elementRefs.set(element, ref);
    if (isRefOwnerKey(ref)) {
      refOwners.set(ref, element);
    }
  } else {
    elementRefs.delete(element);
  }
}

export function removeElementRef(element: Element): void {
  const ref = elementRefs.get(element);

  if (!ref) {
    return;
  }

  if (typeof ref !== 'function' && getElementRefOwner(ref) !== element) {
    elementRefs.delete(element);
    return;
  }

  applyRefValue(ref, null);
  const nextOwner = getElementRefOwner(ref);
  if (typeof ref === 'function' && nextOwner && nextOwner !== element) {
    applyRefValue(ref, nextOwner);
  }
  replaceElementRefBookkeeping(element, undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Instance Cleanup Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cleanupSingleInstance(
  node: InstanceHost,
  errors: unknown[] | null,
  strict: boolean
): void {
  const instanceList = node.__ASKR_INSTANCES;
  const primaryInstance = node.__ASKR_INSTANCE;
  if (!instanceList && !primaryInstance) {
    return;
  }

  const instances = new Set<ComponentInstance>();

  if (Array.isArray(instanceList)) {
    for (const instance of instanceList) {
      if (instance) {
        instances.add(instance as ComponentInstance);
      }
    }
  }

  if (primaryInstance) {
    instances.add(primaryInstance as ComponentInstance);
  }

  for (const instance of instances) {
    try {
      cleanupComponent(instance);
    } catch (err) {
      if (strict) errors!.push(err);
      else logger.warn('[Askr] cleanupComponent failed:', err);
    }
  }

  try {
    delete node.__ASKR_INSTANCE;
    delete node.__ASKR_INSTANCES;
  } catch (e) {
    if (strict) errors!.push(e);
  }
}

function teardownSingleElement(
  element: Element,
  errors: unknown[] | null,
  strict: boolean
): void {
  try {
    removeElementRef(element);
  } catch (err) {
    if (strict) errors!.push(err);
    else logger.warn('[Askr] removeElementRef failed:', err);
  }

  try {
    removeElementListeners(element);
  } catch (err) {
    if (strict) errors!.push(err);
    else logger.warn('[Askr] removeElementListeners failed:', err);
  }

  try {
    removeElementReactiveProps(element);
  } catch (err) {
    if (strict) errors!.push(err);
    else logger.warn('[Askr] removeElementReactiveProps failed:', err);
  }

  try {
    cleanupSingleInstance(element as InstanceHost, errors, strict);
  } catch (err) {
    if (strict) errors!.push(err);
    else logger.warn('[Askr] cleanupSingleInstance failed:', err);
  }
}

// Walk descendant elements with minimal allocations.
// HOT PATH: used during subtree teardown (replace/unmount).
function forEachDescendantElement(root: Element, visit: (el: Element) => void) {
  // Prefer TreeWalker when available; it avoids allocating a NodeList.
  try {
    const doc = root.ownerDocument;
    const createTreeWalker = doc?.createTreeWalker;
    if (typeof createTreeWalker === 'function') {
      // NodeFilter.SHOW_ELEMENT === 1
      const walker = createTreeWalker.call(doc, root, 1);
      let n = walker.firstChild();
      while (n) {
        visit(n as Element);
        n = walker.nextNode();
      }
      return;
    }
  } catch {
    // SLOW PATH: TreeWalker unavailable
  }

  // Fallback: querySelectorAll
  const descendants = root.querySelectorAll('*');
  for (let i = 0; i < descendants.length; i++) {
    visit(descendants[i]);
  }
}

/** @internal Walk every descendant node, including component-host comments. */
export function forEachDescendantNode(root: Node, visit: (node: Node) => void) {
  try {
    const doc = root.ownerDocument;
    const createTreeWalker = doc?.createTreeWalker;
    if (typeof createTreeWalker === 'function') {
      // NodeFilter.SHOW_ALL === 0xffffffff
      const walker = createTreeWalker.call(doc, root, 0xffffffff);
      let node = walker.nextNode();
      while (node) {
        visit(node);
        node = walker.nextNode();
      }
      return;
    }
  } catch {
    // SLOW PATH: TreeWalker unavailable
  }

  const stack = Array.from(root.childNodes).reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    visit(node);
    for (let child = node.lastChild; child; child = child.previousSibling) {
      stack.push(child);
    }
  }
}

function forEachElementInSubtree(root: Element, visit: (el: Element) => void) {
  visit(root);
  forEachDescendantElement(root, visit);
}

// Track listeners so we can remove them on cleanup
export interface ListenerMapEntry {
  handler: EventListener;
  original: EventListener;
  eventName: string;
  options?: boolean | AddEventListenerOptions;
  isDelegated?: boolean;
  updateHandler?: (nextHandler: EventListener) => void;
}
export const elementListeners = new WeakMap<
  Element,
  Map<string, ListenerMapEntry>
>();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clean up component instance attached to a DOM node
 * Accepts an optional `opts.strict` flag to surface errors instead of swallowing them.
 */
export function cleanupInstanceIfPresent(
  node: Node | null,
  opts?: { strict?: boolean }
): void {
  if (!node) return;

  const strict = opts?.strict ?? false;
  const errors: unknown[] | null = strict ? [] : null;

  // Clean up the node itself
  try {
    cleanupSingleInstance(node as InstanceHost, errors, strict);
  } catch (err) {
    if (strict) errors!.push(err);
    else logger.warn('[Askr] cleanupInstanceIfPresent failed:', err);
  }

  // Clean up any nested instances, including null-component comment hosts.
  try {
    forEachDescendantNode(node, (descendant) => {
      try {
        cleanupSingleInstance(descendant as InstanceHost, errors, strict);
      } catch (err) {
        if (strict) errors!.push(err);
        else
          logger.warn(
            '[Askr] cleanupInstanceIfPresent descendant cleanup failed:',
            err
          );
      }
    });
  } catch (err) {
    if (strict) errors!.push(err);
    else
      logger.warn(
        '[Askr] cleanupInstanceIfPresent descendant query failed:',
        err
      );
  }

  if (errors && errors.length > 0) {
    throw new AggregateError(errors, 'cleanupInstanceIfPresent failed');
  }
}

// Public helper to clean up any component instances under a node. Used by
// runtime commit logic to ensure component instances are torn down when their
// host nodes are removed during an update.
export function cleanupInstancesUnder(
  node: Node | null,
  opts?: { strict?: boolean }
): void {
  cleanupInstanceIfPresent(node, opts);
}

export function teardownNodeSubtree(
  node: Node | null,
  opts?: { strict?: boolean }
): void {
  if (!node) return;

  const strict = opts?.strict ?? false;
  const errors: unknown[] | null = strict ? [] : null;

  if (!(node instanceof Element)) {
    cleanupSingleInstance(node as InstanceHost, errors, strict);
    if (errors && errors.length > 0) {
      throw new AggregateError(errors, 'teardownNodeSubtree failed');
    }
    return;
  }

  try {
    teardownSingleElement(node, errors, strict);
    forEachDescendantNode(node, (descendant) => {
      if (descendant instanceof Element) {
        teardownSingleElement(descendant, errors, strict);
      } else {
        cleanupSingleInstance(descendant as InstanceHost, errors, strict);
      }
    });
  } catch (err) {
    if (strict) errors!.push(err);
    else logger.warn('[Askr] teardownNodeSubtree failed:', err);
  }

  if (errors && errors.length > 0) {
    throw new AggregateError(errors, 'teardownNodeSubtree failed');
  }
}

// Track reactive props cleanup functions and their function references
export interface ReactivePropCleanupEntry {
  /** @internal Key used while this entry is the element's direct store. */
  _bindingKey?: string;
  cleanup: () => void;
  fnRef: unknown;
  /** @internal Blueprint scalar bindings store their compute directly. */
  groupedScalar?: boolean;
  restoreFn?: (nextValue: unknown) => ReactivePropCleanupEntry;
  updateFn?: (nextValue: unknown) => void;
}

export const REACTIVE_CHILDREN_KEY = '__askr_reactive_children__';

type ReactivePropCleanupStore =
  | Map<string, ReactivePropCleanupEntry>
  | ReactivePropCleanupEntry;

export const elementReactivePropsCleanup = new WeakMap<
  Element,
  ReactivePropCleanupStore
>();

export function getElementReactivePropsCleanupMap(
  element: Element,
  create = false
): Map<string, ReactivePropCleanupEntry> | undefined {
  const store = elementReactivePropsCleanup.get(element);
  if (store instanceof Map) {
    return store;
  }
  if (store) {
    const map = new Map([[store._bindingKey!, store]]);
    elementReactivePropsCleanup.set(element, map);
    return map;
  }
  if (!create) {
    return undefined;
  }

  const map = new Map<string, ReactivePropCleanupEntry>();
  elementReactivePropsCleanup.set(element, map);
  return map;
}

export function setDirectElementReactivePropCleanup(
  element: Element,
  bindingKey: string,
  entry: ReactivePropCleanupEntry
): void {
  const store = elementReactivePropsCleanup.get(element);
  if (!store) {
    entry._bindingKey = bindingKey;
    elementReactivePropsCleanup.set(element, entry);
    return;
  }

  const map = getElementReactivePropsCleanupMap(element, true)!;
  map.set(bindingKey, entry);
}

/** @internal Publish the first reactive binding on a newly created element. */
export function setFreshElementReactivePropCleanup(
  element: Element,
  bindingKey: string,
  entry: ReactivePropCleanupEntry
): void {
  entry._bindingKey = bindingKey;
  elementReactivePropsCleanup.set(element, entry);
}

export function getElementReactivePropCleanupSize(element: Element): number {
  const store = elementReactivePropsCleanup.get(element);
  return store instanceof Map ? store.size : store ? 1 : 0;
}

export function forEachElementReactivePropCleanup(
  element: Element,
  visit: (entry: ReactivePropCleanupEntry) => void
): void {
  const store = elementReactivePropsCleanup.get(element);
  if (store instanceof Map) {
    for (const entry of store.values()) {
      visit(entry);
    }
  } else if (store) {
    visit(store);
  }
}

export function removeElementReactiveProps(element: Element): void {
  if (elementReactivePropsCleanup.has(element)) {
    forEachElementReactivePropCleanup(element, (entry) => {
      try {
        entry.cleanup();
      } catch (err) {
        logger.warn('[Askr] reactive prop cleanup failed:', err);
      }
    });
    elementReactivePropsCleanup.delete(element);
  }
}

export function removeElementListeners(element: Element): void {
  const map = elementListeners.get(element);
  if (map) {
    for (const entry of map.values()) {
      incDevCounter('listenerRemoves');
      if (entry.isDelegated) {
        removeDelegatedListener(element, entry.eventName);
      } else {
        if (entry.options !== undefined)
          element.removeEventListener(
            entry.eventName,
            entry.handler,
            entry.options
          );
        else element.removeEventListener(entry.eventName, entry.handler);
      }
    }
    elementListeners.delete(element);
  }

  clearDelegatedHandlersForElement(element);
}

export function removeAllListeners(root: Element | null): void {
  if (!root) return;

  forEachElementInSubtree(root, (el) => {
    removeElementRef(el);
    removeElementListeners(el);
    removeElementReactiveProps(el);
  });
}
