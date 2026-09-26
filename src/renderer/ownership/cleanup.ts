import { writeHostOwners } from './nodes';
import { cleanupComponent, type ComponentInstance } from '../../runtime';
import { cleanupComponentGeneration } from '../../runtime/component/cleanup';
import type { OwnershipRecord } from '../../runtime/ownership/record';
import { registerCommitEffect } from '../../runtime';
import { registerCommitParticipant } from '../../runtime/transactions/access';
import { reportUncaughtErrorLater } from '../../common/report-error';
import { incDevCounter } from '../../runtime';
import {
  clearDelegatedHandlersForElement,
  removeDelegatedListener,
} from '../props/events';
import { setRef } from '../../foundations/utilities/compose-ref';
import type { InstanceHostNode } from '../dom-host';

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
  setRef(ref as Ref<T>, value);
}

export function updateElementRef<T extends Element>(
  element: T,
  ref: unknown
): void {
  const transactionKey = {};
  if (
    registerCommitEffect(
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
      // staged in the same transaction: old owner gets null first, then
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

  // Retire the binding even when the callback throws, so a later teardown
  // pass over the same element cannot run (and report) it again.
  const errors: unknown[] = [];
  try {
    applyRefValue(ref, null);
  } catch (error) {
    errors.push(error);
  }
  const nextOwner = getElementRefOwner(ref);
  replaceElementRefBookkeeping(element, undefined);
  if (typeof ref === 'function' && nextOwner && nextOwner !== element) {
    try {
      applyRefValue(ref, nextOwner);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Ref cleanup failed');
}

// ─────────────────────────────────────────────────────────────────────────────
// Teardown Error Collection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Surface failures collected while draining a teardown. Every step runs
 * before this is called. Strict callers receive the failures as a thrown
 * AggregateError. Otherwise the failures are reported like an uncaught
 * listener exception (`reportError`), in every build, once the current task
 * finishes, so the caller's DOM update continues and error handlers never run
 * inside it: a single failure as-is, several as one AggregateError.
 */
function surfaceTeardownErrors(
  errors: unknown[],
  strict: boolean,
  message: string
): void {
  if (errors.length === 0) return;
  if (strict) throw new AggregateError(errors, message);
  reportUncaughtErrorLater(
    errors.length === 1 ? errors[0] : new AggregateError(errors, message)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Instance Cleanup Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cleanupSingleInstance(node: InstanceHost, errors: unknown[]): void {
  const instanceList = node.__ASKR_INSTANCES;
  const primaryInstance = node.__ASKR_INSTANCE;
  if (!instanceList && !primaryInstance) {
    return;
  }

  const instances = new Map<ComponentInstance, OwnershipRecord>();

  if (Array.isArray(instanceList)) {
    for (const instance of instanceList) {
      if (instance) {
        const component = instance as ComponentInstance;
        instances.set(component, component.owner);
      }
    }
  }

  if (primaryInstance) {
    const component = primaryInstance as ComponentInstance;
    instances.set(component, component.owner);
  }

  for (const [instance, owner] of instances) {
    try {
      if (instance.owner === owner) cleanupComponent(instance);
      else cleanupComponentGeneration(instance, owner);
    } catch (err) {
      errors.push(err);
    }
  }

  try {
    const current = node as InstanceHostNode;
    const retained = current.__ASKR_INSTANCES?.filter(
      (instance) => !instance.owner.disposed
    );
    const primary = current.__ASKR_INSTANCE;
    writeHostOwners(
      current,
      retained?.length ? retained : undefined,
      primary && !primary.owner.disposed ? primary : retained?.[0]
    );
  } catch (e) {
    errors.push(e);
  }
}

function teardownSingleElement(element: Element, errors: unknown[]): void {
  try {
    removeElementRef(element);
  } catch (err) {
    errors.push(err);
  }

  drainElementListeners(element, errors);
  drainElementReactiveProps(element, errors);
  cleanupSingleInstance(element as InstanceHost, errors);
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

  const errors: unknown[] = [];

  // Clean up the node itself
  cleanupSingleInstance(node as InstanceHost, errors);

  // Clean up any nested instances, including null-component comment hosts.
  try {
    forEachDescendantNode(node, (descendant) => {
      cleanupSingleInstance(descendant as InstanceHost, errors);
    });
  } catch (err) {
    errors.push(err);
  }

  surfaceTeardownErrors(
    errors,
    opts?.strict ?? false,
    'cleanupInstanceIfPresent failed'
  );
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

const RETIRE_SUBTREE = {};

/** Defer lifetime and binding retirement until reversible application succeeds. */
export function retireNodeSubtree(node: Node): void {
  if (
    !registerCommitParticipant({
      key: node,
      kind: RETIRE_SUBTREE,
      collision: 'keep-first',
      settle: () => teardownNodeSubtree(node),
    })
  ) {
    teardownNodeSubtree(node);
  }
}

/**
 * Tear down renderer bindings and component lifetimes for a node and all of
 * its descendants. Every ref, listener, reactive prop, and component cleanup
 * is attempted even when an earlier one throws. Failures are surfaced after
 * the whole subtree drains: thrown when `opts.strict` is set, otherwise
 * reported with `reportError` (see `surfaceTeardownErrors`).
 */
export function teardownNodeSubtree(
  node: Node | null,
  opts?: { strict?: boolean }
): void {
  if (!node) return;

  const errors: unknown[] = [];

  if (!(node instanceof Element)) {
    cleanupSingleInstance(node as InstanceHost, errors);
  } else {
    teardownSingleElement(node, errors);
    try {
      forEachDescendantNode(node, (descendant) => {
        if (descendant instanceof Element) {
          teardownSingleElement(descendant, errors);
        } else {
          cleanupSingleInstance(descendant as InstanceHost, errors);
        }
      });
    } catch (err) {
      errors.push(err);
    }
  }

  surfaceTeardownErrors(
    errors,
    opts?.strict ?? false,
    'teardownNodeSubtree failed'
  );
}

// Track reactive props cleanup functions and their function references
export interface ReactivePropCleanupEntry {
  /** @internal Key used while this entry is the element's direct store. */
  _bindingKey?: string;
  cleanup: () => void;
  fnRef: unknown;
  /** @internal Blueprint scalar bindings store their compute directly. */
  groupedScalar?: boolean;
  /**
   * @internal The value this binding last applied to the DOM, or `undefined`
   * before its first commit. Seeds owned-only diffing when the prop turns
   * static or is removed.
   */
  readAppliedValue?: () => unknown;
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

function drainElementReactiveProps(element: Element, errors: unknown[]) {
  if (!elementReactivePropsCleanup.has(element)) return;
  forEachElementReactivePropCleanup(element, (entry) => {
    try {
      entry.cleanup();
    } catch (err) {
      errors.push(err);
    }
  });
  elementReactivePropsCleanup.delete(element);
}

/** Run every reactive prop cleanup, then report any failures. */
export function removeElementReactiveProps(element: Element): void {
  const errors: unknown[] = [];
  drainElementReactiveProps(element, errors);
  surfaceTeardownErrors(errors, false, 'Reactive prop cleanup failed');
}

function drainElementListeners(element: Element, errors: unknown[]): void {
  const map = elementListeners.get(element);
  if (map) {
    for (const entry of map.values()) {
      incDevCounter('listenerRemoves');
      try {
        if (entry.isDelegated) {
          removeDelegatedListener(element, entry.eventName);
        } else if (entry.options !== undefined) {
          element.removeEventListener(
            entry.eventName,
            entry.handler,
            entry.options
          );
        } else {
          element.removeEventListener(entry.eventName, entry.handler);
        }
      } catch (err) {
        errors.push(err);
      }
    }
    elementListeners.delete(element);
  }

  try {
    clearDelegatedHandlersForElement(element);
  } catch (err) {
    errors.push(err);
  }
}

/** Remove every tracked listener, then report any failures. */
export function removeElementListeners(element: Element): void {
  const errors: unknown[] = [];
  drainElementListeners(element, errors);
  surfaceTeardownErrors(errors, false, 'Listener cleanup failed');
}

/**
 * Remove refs, listeners, and reactive props across a subtree without
 * touching component lifetimes. Failures are reported like non-strict
 * `teardownNodeSubtree` after every element is visited.
 */
export function removeAllListeners(root: Element | null): void {
  if (!root) return;

  const errors: unknown[] = [];
  try {
    forEachElementInSubtree(root, (el) => {
      try {
        removeElementRef(el);
      } catch (err) {
        errors.push(err);
      }
      drainElementListeners(el, errors);
      drainElementReactiveProps(el, errors);
    });
  } catch (err) {
    errors.push(err);
  }
  surfaceTeardownErrors(errors, false, 'removeAllListeners failed');
}
