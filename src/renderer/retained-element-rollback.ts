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
  getElementReactivePropsCleanupMap,
  replaceElementRefBookkeeping,
  type ListenerMapEntry,
  type ReactivePropCleanupEntry,
} from './cleanup';
import { keyedElements } from './keyed';
import {
  getCurrentLifecycleCommitBatch,
  registerLifecycleTransaction,
} from '../runtime';

interface FormControlSnapshot {
  value?: string;
  checked?: boolean;
}

interface DelegatedListenerEntrySnapshot {
  eventName: string;
  handler: EventListener;
  original: EventListener;
  options?: AddEventListenerOptions;
}

interface ListenerEntrySnapshot {
  listenerKey: string;
  entry: ListenerMapEntry;
}

interface ReactivePropEntrySnapshot {
  propName: string;
  entry: ReactivePropCleanupEntry;
}

interface TextSnapshot {
  node: Text;
  data: string;
}

export interface RetainedElementSnapshot {
  attributes: Array<[string, string]>;
  childNodes: Node[];
  delegatedListeners: DelegatedListenerEntrySnapshot[];
  domCaptured: boolean;
  formControl: FormControlSnapshot | null;
  keyedMap: Map<string | number, Element> | undefined;
  listeners: ListenerEntrySnapshot[];
  reactiveProps: ReactivePropEntrySnapshot[];
  ref: unknown;
  textNodes: TextSnapshot[];
}

function collectTextSnapshots(root: Element): TextSnapshot[] {
  const snapshots: TextSnapshot[] = [];
  for (let index = 0; index < root.childNodes.length; index += 1) {
    const node = root.childNodes[index];
    if (node.nodeType === 3) {
      const text = node as Text;
      snapshots.push({ node: text, data: text.data });
    }
  }
  return snapshots;
}

function getFormControlSnapshot(element: Element): FormControlSnapshot | null {
  const control = element as Element & {
    value?: unknown;
    checked?: unknown;
  };
  const snapshot: FormControlSnapshot = {};

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
    groupedScalar: entry.groupedScalar,
    restoreFn: entry.restoreFn,
    updateFn: entry.updateFn,
  };
}

export function snapshotRetainedElement(
  element: Element,
  bindingsOnly = false
): RetainedElementSnapshot {
  // Child updates register their own shallow records. Keeping this record
  // direct-element-only is what makes a large component-boundary batch cheap.
  const listenerMap = elementListeners.get(element);
  const delegatedHandlerMap = getDelegatedHandlersForElement(element);
  const reactivePropMap = getElementReactivePropsCleanupMap(element);

  const keyedMap = keyedElements.get(element);

  return {
    attributes: bindingsOnly
      ? []
      : Array.from(element.attributes, (attribute) => [
          attribute.name,
          attribute.value,
        ]),
    childNodes: bindingsOnly ? [] : Array.from(element.childNodes),
    delegatedListeners: delegatedHandlerMap
      ? Array.from(delegatedHandlerMap, ([eventName, entry]) => ({
          eventName,
          handler: entry.handler,
          original: entry.original,
          options: entry.options,
        }))
      : [],
    domCaptured: !bindingsOnly,
    formControl: bindingsOnly ? null : getFormControlSnapshot(element),
    keyedMap: keyedMap ? new Map(keyedMap) : undefined,
    listeners: listenerMap
      ? Array.from(listenerMap, ([listenerKey, entry]) => ({
          listenerKey,
          entry: cloneListenerEntry(entry),
        }))
      : [],
    reactiveProps: reactivePropMap
      ? Array.from(reactivePropMap, ([propName, entry]) => ({
          propName,
          entry: cloneReactivePropEntry(entry),
        }))
      : [],
    ref: elementRefs.get(element),
    textNodes: bindingsOnly ? [] : collectTextSnapshots(element),
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

function restoreAttributes(
  element: Element,
  snapshot: RetainedElementSnapshot
): void {
  const expectedNames = new Set(snapshot.attributes.map(([name]) => name));

  for (const attribute of Array.from(element.attributes)) {
    if (!expectedNames.has(attribute.name)) {
      element.removeAttribute(attribute.name);
    }
  }

  for (const [name, value] of snapshot.attributes) {
    if (element.getAttribute(name) !== value) {
      element.setAttribute(name, value);
    }
  }
}

function restoreFormControl(
  element: Element,
  snapshot: RetainedElementSnapshot
): void {
  if (!snapshot.formControl) return;
  const { value, checked } = snapshot.formControl;
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

function restoreRef(element: Element, snapshot: RetainedElementSnapshot): void {
  const currentRef = elementRefs.get(element);

  if (currentRef !== snapshot.ref) {
    applyRefValue(currentRef, null);
  }

  if (snapshot.ref) {
    applyRefValue(snapshot.ref, element);
    replaceElementRefBookkeeping(element, snapshot.ref);
  } else {
    replaceElementRefBookkeeping(element, undefined);
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

function restoreListeners(
  element: Element,
  snapshot: RetainedElementSnapshot
): void {
  const errors: unknown[] = [];
  const expectedKeys = new Set(
    snapshot.listeners.map(({ listenerKey }) => listenerKey)
  );
  let currentMap = elementListeners.get(element);

  if (currentMap) {
    for (const [listenerKey, entry] of Array.from(currentMap)) {
      if (!expectedKeys.has(listenerKey)) {
        try {
          removeDirectListener(element, entry);
        } catch (error) {
          errors.push(error);
        }
        currentMap.delete(listenerKey);
      }
    }
  }

  if (snapshot.listeners.length === 0) {
    if (currentMap?.size === 0) {
      elementListeners.delete(element);
    }
  } else {
    if (!currentMap) {
      currentMap = new Map();
      elementListeners.set(element, currentMap);
    }

    for (const { listenerKey, entry } of snapshot.listeners) {
      const currentEntry = currentMap.get(listenerKey);

      entry.updateHandler?.(entry.original);

      if (currentEntry && currentEntry.handler !== entry.handler) {
        try {
          removeDirectListener(element, currentEntry);
        } catch (error) {
          errors.push(error);
        }
      }

      if (!currentEntry || currentEntry.handler !== entry.handler) {
        try {
          addDirectListener(element, entry);
        } catch (error) {
          errors.push(error);
        }
      } else {
        currentEntry.updateHandler?.(entry.original);
      }

      currentMap.set(listenerKey, cloneListenerEntry(entry));
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Listener rollback failed');
  }
}

function restoreDelegatedListeners(
  element: Element,
  snapshot: RetainedElementSnapshot
): void {
  const errors: unknown[] = [];
  const expectedEventNames = new Set(
    snapshot.delegatedListeners.map(({ eventName }) => eventName)
  );
  const currentMap = getDelegatedHandlersForElement(element);

  if (currentMap) {
    for (const eventName of currentMap.keys()) {
      if (!expectedEventNames.has(eventName)) {
        try {
          removeDelegatedListener(element, eventName);
        } catch (error) {
          errors.push(error);
        }
      }
    }
  }

  for (const {
    eventName,
    handler,
    original,
    options,
  } of snapshot.delegatedListeners) {
    try {
      if (
        !updateDelegatedListener(element, eventName, handler, original, options)
      ) {
        addDelegatedListener(element, eventName, handler, original, options);
      }
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Delegated listener rollback failed');
  }
}

function restoreReactiveProps(
  element: Element,
  snapshot: RetainedElementSnapshot
): void {
  const errors: unknown[] = [];
  const expectedPropNames = new Set(
    snapshot.reactiveProps.map(({ propName }) => propName)
  );
  let currentMap = getElementReactivePropsCleanupMap(element);

  if (currentMap) {
    for (const [propName, entry] of Array.from(currentMap)) {
      if (!expectedPropNames.has(propName)) {
        try {
          entry.cleanup();
        } catch (error) {
          errors.push(error);
        }
        currentMap.delete(propName);
      }
    }
  }

  if (snapshot.reactiveProps.length === 0) {
    if (currentMap?.size === 0) {
      elementReactivePropsCleanup.delete(element);
    }
  } else {
    if (!currentMap) {
      currentMap = new Map();
      elementReactivePropsCleanup.set(element, currentMap);
    }

    for (const { propName, entry } of snapshot.reactiveProps) {
      const currentEntry = currentMap.get(propName);

      if (currentEntry) {
        currentEntry.updateFn?.(entry.fnRef);
        currentEntry.fnRef = entry.fnRef;
        currentMap.set(propName, currentEntry);
        continue;
      }

      currentMap.set(
        propName,
        (() => {
          try {
            return (
              entry.restoreFn?.(entry.fnRef) ?? cloneReactivePropEntry(entry)
            );
          } catch (error) {
            errors.push(error);
            return cloneReactivePropEntry(entry);
          }
        })()
      );
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Reactive property rollback failed');
  }
}

function restoreChildNodes(
  element: Element,
  snapshot: RetainedElementSnapshot,
  cleanupRangeNode: (node: Node) => void
): void {
  const errors: unknown[] = [];
  const expectedChildren = new Set(snapshot.childNodes);

  for (const child of Array.from(element.childNodes)) {
    if (!expectedChildren.has(child)) {
      try {
        cleanupRangeNode(child);
      } catch (error) {
        errors.push(error);
      }
    }
  }

  if (!sameChildOrder(element, snapshot.childNodes)) {
    element.replaceChildren(...snapshot.childNodes);
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'DOM range rollback cleanup failed');
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
  const errors: unknown[] = [];
  const phases: Array<() => void> = [
    ...(snapshot.domCaptured
      ? [
          () => restoreChildNodes(element, snapshot, cleanupRangeNode),
          () => restoreTextNodes(snapshot),
          () => restoreFormControl(element, snapshot),
          () => restoreAttributes(element, snapshot),
        ]
      : []),
    () => restoreReactiveProps(element, snapshot),
    () => restoreRef(element, snapshot),
    () => restoreListeners(element, snapshot),
    () => restoreDelegatedListeners(element, snapshot),
    ...(snapshot.domCaptured ? [() => restoreKeyedMap(element, snapshot)] : []),
  ];
  for (const phase of phases) {
    try {
      phase();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Retained element rollback failed');
  }
}

export function runRetainedElementUpdate(
  element: Element,
  cleanupRangeNode: (node: Node) => void,
  update: () => void,
  onError?: () => void,
  bindingsOnly = false
): void {
  const batch = getCurrentLifecycleCommitBatch();
  const existingSnapshot = batch?.retainedElementSnapshots.get(element) as
    | RetainedElementSnapshot
    | undefined;
  const snapshot =
    existingSnapshot ?? snapshotRetainedElement(element, bindingsOnly);
  let restored = false;
  if (batch && !existingSnapshot) {
    batch.retainedElementSnapshots.set(element, snapshot);
    registerLifecycleTransaction(
      element,
      () => undefined,
      () => {
        if (restored) return;
        restored = true;
        restoreRetainedElement(element, snapshot, cleanupRangeNode);
      }
    );
  }

  try {
    update();
  } catch (err) {
    onError?.();

    try {
      restored = true;
      restoreRetainedElement(element, snapshot, cleanupRangeNode);
    } catch (rollbackError) {
      logger.warn(
        '[Askr] retained element rollback failed:',
        new AggregateError(
          [err, rollbackError],
          'Render failed and retained rollback reported errors'
        )
      );
    }

    throw err;
  }
}
