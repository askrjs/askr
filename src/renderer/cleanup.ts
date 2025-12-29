import { cleanupComponent } from '../runtime/component';
import type { ComponentInstance } from '../runtime/component';
import { logger } from '../dev/logger';

type InstanceHost = Element & { __ASKR_INSTANCE?: unknown };

// ─────────────────────────────────────────────────────────────────────────────
// Instance Cleanup Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cleanupSingleInstance(
  node: InstanceHost,
  errors: unknown[] | null,
  strict: boolean
): void {
  const inst = node.__ASKR_INSTANCE;
  if (!inst) return;

  try {
    cleanupComponent(inst as ComponentInstance);
  } catch (err) {
    if (strict) errors!.push(err);
    else logger.warn('[Askr] cleanupComponent failed:', err);
  }

  try {
    delete node.__ASKR_INSTANCE;
  } catch (e) {
    if (strict) errors!.push(e);
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
  if (!node || !(node instanceof Element)) return;

  const strict = opts?.strict ?? false;
  const errors: unknown[] | null = strict ? [] : null;

  // Clean up the node itself
  try {
    cleanupSingleInstance(node as InstanceHost, errors, strict);
  } catch (err) {
    if (strict) errors!.push(err);
    else logger.warn('[Askr] cleanupInstanceIfPresent failed:', err);
  }

  // Clean up any nested instances on descendants
  try {
    forEachDescendantElement(node, (d) => {
      try {
        cleanupSingleInstance(d as InstanceHost, errors, strict);
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

// Track listeners so we can remove them on cleanup
export interface ListenerMapEntry {
  handler: EventListener;
  original: EventListener;
  options?: boolean | AddEventListenerOptions;
}
export const elementListeners = new WeakMap<
  Element,
  Map<string, ListenerMapEntry>
>();

export function removeElementListeners(element: Element): void {
  const map = elementListeners.get(element);
  if (map) {
    for (const [eventName, entry] of map) {
      // When removing, reuse the original options if present for correctness
      if (entry.options !== undefined)
        element.removeEventListener(eventName, entry.handler, entry.options);
      else element.removeEventListener(eventName, entry.handler);
    }
    elementListeners.delete(element);
  }
}

export function removeAllListeners(root: Element | null): void {
  if (!root) return;

  // Remove listeners from root
  removeElementListeners(root);

  // Recursively remove from all children
  forEachDescendantElement(root, removeElementListeners);
}
