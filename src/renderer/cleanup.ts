import { cleanupComponent } from '../runtime/component';
import type { ComponentInstance } from '../runtime/component';
import { logger } from '../dev/logger';

type InstanceHost = Element & { __ASKR_INSTANCE?: unknown };

// Helpers to clean up component instances when their host DOM nodes are removed
// Accepts an optional `opts.strict` flag to surface errors instead of swallowing them.
export function cleanupInstanceIfPresent(
  node: Node | null,
  opts?: { strict?: boolean }
): void {
  if (!node) return;
  if (!(node instanceof Element)) return;

  const errors: unknown[] = [];

  try {
    const inst = (node as InstanceHost).__ASKR_INSTANCE;
    if (inst) {
      try {
        cleanupComponent(inst as unknown as ComponentInstance);
      } catch (err) {
        if (opts?.strict) errors.push(err);
        else if (process.env.NODE_ENV !== 'production')
          logger.warn('[Askr] cleanupComponent failed:', err);
      }
      try {
        delete (node as InstanceHost).__ASKR_INSTANCE;
      } catch (e) {
        if (opts?.strict) errors.push(e);
        else void e;
      }
    }
  } catch (err) {
    if (opts?.strict) errors.push(err);
    else if (process.env.NODE_ENV !== 'production') {
      logger.warn('[Askr] cleanupInstanceIfPresent failed:', err);
    }
  }

  // Also attempt to clean up any nested instances that may be attached
  // on descendants (defensive: some components may attach to deeper nodes)
  try {
    const descendants = node.querySelectorAll('*');
    for (const d of Array.from(descendants)) {
      try {
        const inst = (d as InstanceHost).__ASKR_INSTANCE;
        if (inst) {
          try {
            cleanupComponent(inst as unknown as ComponentInstance);
          } catch (err) {
            if (opts?.strict) errors.push(err);
            else if (process.env.NODE_ENV !== 'production') {
              logger.warn(
                '[Askr] cleanupInstanceIfPresent descendant cleanup failed:',
                err
              );
            }
          }
          try {
            delete (d as InstanceHost).__ASKR_INSTANCE;
          } catch (e) {
            if (opts?.strict) errors.push(e);
            else void e;
          }
        }
      } catch (err) {
        if (opts?.strict) errors.push(err);
        else if (process.env.NODE_ENV !== 'production') {
          logger.warn(
            '[Askr] cleanupInstanceIfPresent descendant cleanup failed:',
            err
          );
        }
      }
    }
  } catch (err) {
    if (opts?.strict) errors.push(err);
    else if (process.env.NODE_ENV !== 'production') {
      logger.warn(
        '[Askr] cleanupInstanceIfPresent descendant query failed:',
        err
      );
    }
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
}
export const elementListeners = new WeakMap<
  Element,
  Map<string, ListenerMapEntry>
>();

export function removeElementListeners(element: Element): void {
  const map = elementListeners.get(element);
  if (map) {
    for (const [eventName, entry] of map) {
      element.removeEventListener(eventName, entry.handler);
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
