import { cleanupComponent } from '../runtime/component';
import type { ComponentInstance } from '../runtime/component';
import { logger } from '../dev/logger';

type InstanceHost = Element & { __ASKR_INSTANCE?: unknown };

// ─────────────────────────────────────────────────────────────────────────────
// Instance Cleanup Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cleanupSingleInstance(
  node: InstanceHost,
  errors: unknown[],
  strict: boolean
): void {
  const inst = node.__ASKR_INSTANCE;
  if (!inst) return;

  try {
    cleanupComponent(inst as ComponentInstance);
  } catch (err) {
    if (strict) errors.push(err);
    else logger.warn('[Askr] cleanupComponent failed:', err);
  }

  try {
    delete node.__ASKR_INSTANCE;
  } catch (e) {
    if (strict) errors.push(e);
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

  const errors: unknown[] = [];
  const strict = opts?.strict ?? false;

  // Clean up the node itself
  try {
    cleanupSingleInstance(node as InstanceHost, errors, strict);
  } catch (err) {
    if (strict) errors.push(err);
    else logger.warn('[Askr] cleanupInstanceIfPresent failed:', err);
  }

  // Clean up any nested instances on descendants
  try {
    const descendants = node.querySelectorAll('*');
    for (const d of Array.from(descendants)) {
      try {
        cleanupSingleInstance(d as InstanceHost, errors, strict);
      } catch (err) {
        if (strict) errors.push(err);
        else
          logger.warn(
            '[Askr] cleanupInstanceIfPresent descendant cleanup failed:',
            err
          );
      }
    }
  } catch (err) {
    if (strict) errors.push(err);
    else
      logger.warn(
        '[Askr] cleanupInstanceIfPresent descendant query failed:',
        err
      );
  }

  if (errors.length > 0) {
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
  const children = root.querySelectorAll('*');
  for (let i = 0; i < children.length; i++) {
    removeElementListeners(children[i]);
  }
}
