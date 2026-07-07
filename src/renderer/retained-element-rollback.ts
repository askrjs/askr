import { logger } from '../common/logger';
import {
  addDelegatedListener,
  getDelegatedHandlersForElement,
  removeDelegatedListener,
  updateDelegatedListener,
} from '../runtime';
import {
  elementListeners,
  elementReactivePropsCleanup,
  elementRefs,
  type ListenerMapEntry,
  type ReactivePropCleanupEntry,
} from './cleanup';
import { keyedElements } from './keyed';

interface AttributeSnapshot {
  element: Element;
  attributes: Array<[string, string]>;
}

interface ChildNodesSnapshot {
  element: Element;
  childNodes: Node[];
}

interface FormControlSnapshot {
  element: Element;
  value?: string;
  checked?: boolean;
}

interface DelegatedListenerEntrySnapshot {
  eventName: string;
  handler: EventListener;
  original: EventListener;
  options?: AddEventListenerOptions;
}

interface DelegatedListenerSnapshot {
  element: Element;
  entries: DelegatedListenerEntrySnapshot[];
}

interface ListenerEntrySnapshot {
  listenerKey: string;
  entry: ListenerMapEntry;
}

interface ListenerSnapshot {
  element: Element;
  entries: ListenerEntrySnapshot[];
}

interface RefSnapshot {
  element: Element;
  ref: unknown;
}

interface ReactivePropEntrySnapshot {
  propName: string;
  entry: ReactivePropCleanupEntry;
}

interface ReactivePropsSnapshot {
  element: Element;
  entries: ReactivePropEntrySnapshot[];
}

interface TextSnapshot {
  node: Text;
  data: string;
}

export interface RetainedElementSnapshot {
  attributes: AttributeSnapshot[];
  childNodes: ChildNodesSnapshot[];
  delegatedListeners: DelegatedListenerSnapshot[];
  formControls: FormControlSnapshot[];
  keyedMap: Map<string | number, Element> | undefined;
  listeners: ListenerSnapshot[];
  reactiveProps: ReactivePropsSnapshot[];
  refs: RefSnapshot[];
  textNodes: TextSnapshot[];
}

function collectElementSubtree(root: Element): Element[] {
  const elements = [root];
  const descendants = root.querySelectorAll('*');
  for (let index = 0; index < descendants.length; index += 1) {
    elements.push(descendants[index]);
  }
  return elements;
}

function collectTextSnapshots(root: Element): TextSnapshot[] {
  const snapshots: TextSnapshot[] = [];
  const stack = Array.from(root.childNodes).reverse();

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.nodeType === 3) {
      snapshots.push({ node: node as Text, data: (node as Text).data });
      continue;
    }

    for (let child = node.lastChild; child; child = child.previousSibling) {
      stack.push(child);
    }
  }

  return snapshots;
}

function getFormControlSnapshot(element: Element): FormControlSnapshot | null {
  const control = element as Element & {
    value?: unknown;
    checked?: unknown;
  };
  const snapshot: FormControlSnapshot = { element };

  if ('value' in control) {
    snapshot.value = String(control.value ?? '');
  }

  if ('checked' in control) {
    snapshot.checked = Boolean(control.checked);
  }

  return snapshot.value !== undefined || snapshot.checked !== undefined
    ? snapshot
    : null;
}

function cloneListenerEntry(entry: ListenerMapEntry): ListenerMapEntry {
  return {
    handler: entry.handler,
    original: entry.original,
    eventName: entry.eventName,
    options: entry.options,
    isDelegated: entry.isDelegated,
    updateHandler: entry.updateHandler,
  };
}

function cloneReactivePropEntry(
  entry: ReactivePropCleanupEntry
): ReactivePropCleanupEntry {
  return {
    cleanup: entry.cleanup,
    fnRef: entry.fnRef,
    restoreFn: entry.restoreFn,
    updateFn: entry.updateFn,
  };
}

export function snapshotRetainedElement(
  element: Element
): RetainedElementSnapshot {
  const elements = collectElementSubtree(element);
  const attributes: AttributeSnapshot[] = [];
  const childNodes: ChildNodesSnapshot[] = [];
  const delegatedListeners: DelegatedListenerSnapshot[] = [];
  const formControls: FormControlSnapshot[] = [];
  const listeners: ListenerSnapshot[] = [];
  const reactiveProps: ReactivePropsSnapshot[] = [];
  const refs: RefSnapshot[] = [];

  for (const currentElement of elements) {
    attributes.push({
      element: currentElement,
      attributes: Array.from(currentElement.attributes, (attribute) => [
        attribute.name,
        attribute.value,
      ]),
    });
    childNodes.push({
      element: currentElement,
      childNodes: Array.from(currentElement.childNodes),
    });

    const formControl = getFormControlSnapshot(currentElement);
    if (formControl) {
      formControls.push(formControl);
    }

    const listenerMap = elementListeners.get(currentElement);
    listeners.push({
      element: currentElement,
      entries: listenerMap
        ? Array.from(listenerMap, ([listenerKey, entry]) => ({
            listenerKey,
            entry: cloneListenerEntry(entry),
          }))
        : [],
    });

    const delegatedHandlerMap = getDelegatedHandlersForElement(currentElement);
    delegatedListeners.push({
      element: currentElement,
      entries: delegatedHandlerMap
        ? Array.from(delegatedHandlerMap, ([eventName, entry]) => ({
            eventName,
            handler: entry.handler,
            original: entry.original,
            options: entry.options,
          }))
        : [],
    });

    const reactivePropMap = elementReactivePropsCleanup.get(currentElement);
    reactiveProps.push({
      element: currentElement,
      entries: reactivePropMap
        ? Array.from(reactivePropMap, ([propName, entry]) => ({
            propName,
            entry: cloneReactivePropEntry(entry),
          }))
        : [],
    });

    refs.push({
      element: currentElement,
      ref: elementRefs.get(currentElement),
    });
  }

  const keyedMap = keyedElements.get(element);

  return {
    attributes,
    childNodes,
    delegatedListeners,
    formControls,
    keyedMap: keyedMap ? new Map(keyedMap) : undefined,
    listeners,
    reactiveProps,
    refs,
    textNodes: collectTextSnapshots(element),
  };
}

function sameChildOrder(element: Element, childNodes: Node[]): boolean {
  if (element.childNodes.length !== childNodes.length) {
    return false;
  }

  for (let index = 0; index < childNodes.length; index += 1) {
    if (element.childNodes[index] !== childNodes[index]) {
      return false;
    }
  }

  return true;
}

function restoreAttributes(snapshot: RetainedElementSnapshot): void {
  for (const { element, attributes } of snapshot.attributes) {
    const expectedNames = new Set(attributes.map(([name]) => name));

    for (const attribute of Array.from(element.attributes)) {
      if (!expectedNames.has(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }

    for (const [name, value] of attributes) {
      if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
      }
    }
  }
}

function restoreFormControls(snapshot: RetainedElementSnapshot): void {
  for (const { element, value, checked } of snapshot.formControls) {
    const control = element as Element & {
      value?: string;
      checked?: boolean;
    };

    if (value !== undefined && 'value' in control) {
      control.value = value;
    }

    if (checked !== undefined && 'checked' in control) {
      control.checked = checked;
    }
  }
}

function applyRefValue<T>(ref: unknown, value: T | null): void {
  if (!ref) {
    return;
  }

  try {
    if (typeof ref === 'function') {
      (ref as (value: T | null) => void)(value);
      return;
    }

    if (Object.isExtensible(ref)) {
      (ref as { current: T | null }).current = value;
    }
  } catch {
    // Rollback must preserve the original render error.
  }
}

function restoreRefs(snapshot: RetainedElementSnapshot): void {
  for (const { element, ref } of snapshot.refs) {
    const currentRef = elementRefs.get(element);

    if (currentRef !== ref) {
      applyRefValue(currentRef, null);
    }

    if (ref) {
      applyRefValue(ref, element);
      elementRefs.set(element, ref);
    } else {
      elementRefs.delete(element);
    }
  }
}

function removeDirectListener(element: Element, entry: ListenerMapEntry): void {
  if (entry.isDelegated) {
    return;
  }

  if (entry.options !== undefined) {
    element.removeEventListener(entry.eventName, entry.handler, entry.options);
  } else {
    element.removeEventListener(entry.eventName, entry.handler);
  }
}

function addDirectListener(element: Element, entry: ListenerMapEntry): void {
  if (entry.isDelegated) {
    return;
  }

  if (entry.options !== undefined) {
    element.addEventListener(entry.eventName, entry.handler, entry.options);
  } else {
    element.addEventListener(entry.eventName, entry.handler);
  }
}

function restoreListeners(snapshot: RetainedElementSnapshot): void {
  for (const { element, entries } of snapshot.listeners) {
    const expectedKeys = new Set(entries.map(({ listenerKey }) => listenerKey));
    let currentMap = elementListeners.get(element);

    if (currentMap) {
      for (const [listenerKey, entry] of Array.from(currentMap)) {
        if (!expectedKeys.has(listenerKey)) {
          removeDirectListener(element, entry);
          currentMap.delete(listenerKey);
        }
      }
    }

    if (entries.length === 0) {
      if (currentMap?.size === 0) {
        elementListeners.delete(element);
      }
      continue;
    }

    if (!currentMap) {
      currentMap = new Map();
      elementListeners.set(element, currentMap);
    }

    for (const { listenerKey, entry } of entries) {
      const currentEntry = currentMap.get(listenerKey);

      entry.updateHandler?.(entry.original);

      if (currentEntry && currentEntry.handler !== entry.handler) {
        removeDirectListener(element, currentEntry);
      }

      if (!currentEntry || currentEntry.handler !== entry.handler) {
        addDirectListener(element, entry);
      } else {
        currentEntry.updateHandler?.(entry.original);
      }

      currentMap.set(listenerKey, cloneListenerEntry(entry));
    }
  }
}

function restoreDelegatedListeners(snapshot: RetainedElementSnapshot): void {
  for (const { element, entries } of snapshot.delegatedListeners) {
    const expectedEventNames = new Set(
      entries.map(({ eventName }) => eventName)
    );
    const currentMap = getDelegatedHandlersForElement(element);

    if (currentMap) {
      for (const eventName of currentMap.keys()) {
        if (!expectedEventNames.has(eventName)) {
          removeDelegatedListener(element, eventName);
        }
      }
    }

    for (const { eventName, handler, original, options } of entries) {
      if (
        !updateDelegatedListener(element, eventName, handler, original, options)
      ) {
        addDelegatedListener(element, eventName, handler, original, options);
      }
    }
  }
}

function restoreReactiveProps(snapshot: RetainedElementSnapshot): void {
  for (const { element, entries } of snapshot.reactiveProps) {
    const expectedPropNames = new Set(entries.map(({ propName }) => propName));
    let currentMap = elementReactivePropsCleanup.get(element);

    if (currentMap) {
      for (const [propName, entry] of Array.from(currentMap)) {
        if (!expectedPropNames.has(propName)) {
          entry.cleanup();
          currentMap.delete(propName);
        }
      }
    }

    if (entries.length === 0) {
      if (currentMap?.size === 0) {
        elementReactivePropsCleanup.delete(element);
      }
      continue;
    }

    if (!currentMap) {
      currentMap = new Map();
      elementReactivePropsCleanup.set(element, currentMap);
    }

    for (const { propName, entry } of entries) {
      const currentEntry = currentMap.get(propName);

      if (currentEntry) {
        currentEntry.updateFn?.(entry.fnRef);
        currentEntry.fnRef = entry.fnRef;
        currentMap.set(propName, currentEntry);
        continue;
      }

      currentMap.set(
        propName,
        entry.restoreFn?.(entry.fnRef) ?? cloneReactivePropEntry(entry)
      );
    }
  }
}

function restoreChildNodes(
  snapshot: RetainedElementSnapshot,
  cleanupRangeNode: (node: Node) => void
): void {
  for (const { element, childNodes } of snapshot.childNodes) {
    const expectedChildren = new Set(childNodes);

    for (const child of Array.from(element.childNodes)) {
      if (!expectedChildren.has(child)) {
        cleanupRangeNode(child);
      }
    }
  }

  for (const { element, childNodes } of snapshot.childNodes) {
    if (!sameChildOrder(element, childNodes)) {
      element.replaceChildren(...childNodes);
    }
  }
}

function restoreTextNodes(snapshot: RetainedElementSnapshot): void {
  for (const { node, data } of snapshot.textNodes) {
    if (node.data !== data) {
      node.data = data;
    }
  }
}

function restoreKeyedMap(
  element: Element,
  snapshot: RetainedElementSnapshot
): void {
  if (snapshot.keyedMap) {
    keyedElements.set(element, new Map(snapshot.keyedMap));
  } else {
    keyedElements.delete(element);
  }
}

export function restoreRetainedElement(
  element: Element,
  snapshot: RetainedElementSnapshot,
  cleanupRangeNode: (node: Node) => void
): void {
  restoreChildNodes(snapshot, cleanupRangeNode);
  restoreReactiveProps(snapshot);
  restoreAttributes(snapshot);
  restoreTextNodes(snapshot);
  restoreFormControls(snapshot);
  restoreRefs(snapshot);
  restoreListeners(snapshot);
  restoreDelegatedListeners(snapshot);
  restoreKeyedMap(element, snapshot);
}

export function runRetainedElementUpdate(
  element: Element,
  cleanupRangeNode: (node: Node) => void,
  update: () => void,
  onError?: () => void
): void {
  const snapshot = snapshotRetainedElement(element);

  try {
    update();
  } catch (err) {
    onError?.();

    try {
      restoreRetainedElement(element, snapshot, cleanupRangeNode);
    } catch (rollbackError) {
      logger.warn('[Askr] retained element rollback failed:', rollbackError);
    }

    throw err;
  }
}
