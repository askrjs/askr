import { cleanupComponent } from '../runtime/component';
import type { ComponentInstance } from '../runtime/component';
import { logger } from '../dev/logger';
import { incDevCounter } from '../runtime/dev-namespace';
import {
  clearDelegatedHandlersForElement,
  removeDelegatedListener,
} from '../runtime/events';

type InstanceHost = Node & {
  __ASKR_INSTANCE?: unknown;
  __ASKR_INSTANCES?: unknown[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Instance Cleanup Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cleanupSingleInstance(
  node: InstanceHost,
  errors: unknown[] | null,
  strict: boolean
): void {
  const instances = new Set<ComponentInstance>();

  if (Array.isArray(node.__ASKR_INSTANCES)) {
    for (const instance of node.__ASKR_INSTANCES) {
      if (instance) {
        instances.add(instance as ComponentInstance);
      }
    }
  }

  if (node.__ASKR_INSTANCE) {
    instances.add(node.__ASKR_INSTANCE as ComponentInstance);
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

function forEachDescendantNode(root: Node, visit: (node: Node) => void) {
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
  cleanup: () => void;
  fnRef: unknown;
  updateFn?: (nextValue: unknown) => void;
}

export const REACTIVE_CHILDREN_KEY = '__askr_reactive_children__';

export const elementReactivePropsCleanup = new WeakMap<
  Element,
  Map<string, ReactivePropCleanupEntry>
>();

export function removeElementReactiveProps(element: Element): void {
  const cleanupMap = elementReactivePropsCleanup.get(element);
  if (cleanupMap) {
    for (const entry of cleanupMap.values()) {
      try {
        entry.cleanup();
      } catch (err) {
        logger.warn('[Askr] reactive prop cleanup failed:', err);
      }
    }
    elementReactivePropsCleanup.delete(element);
  }
}

export function removeElementListeners(element: Element): void {
  const map = elementListeners.get(element);
  if (map) {
    for (const [eventName, entry] of map) {
      incDevCounter('listenerRemoves');
      if (entry.isDelegated) {
        removeDelegatedListener(element, eventName);
      } else {
        if (entry.options !== undefined)
          element.removeEventListener(eventName, entry.handler, entry.options);
        else element.removeEventListener(eventName, entry.handler);
      }
    }
    elementListeners.delete(element);
  }

  clearDelegatedHandlersForElement(element);
}

export function removeAllListeners(root: Element | null): void {
  if (!root) return;

  forEachElementInSubtree(root, (el) => {
    removeElementListeners(el);
    removeElementReactiveProps(el);
  });
}
