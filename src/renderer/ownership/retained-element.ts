import { setRef, type Ref } from '../../foundations/utilities/compose-ref';
import {
  addDelegatedListener,
  getDelegatedHandlersForElement,
  removeDelegatedListener,
  updateDelegatedListener,
} from '../props/events';
import {
  elementListeners,
  elementReactivePropsCleanup,
  elementRefs,
  getElementReactivePropsCleanupMap,
  replaceElementRefBookkeeping,
  type ListenerMapEntry,
  type ReactivePropCleanupEntry,
} from './cleanup';
import { keyedElements } from '../reconciliation/keyed';
import {
  getCurrentCommitTransaction,
  beginCommitTransaction,
  applyTransaction,
  commitTransaction,
  discardTransaction,
  suspendTransaction,
  registerCommitRollback,
} from '../../runtime/transactions/access';

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
  attributes: ReadonlyArray<[string, string]>;
  childNodes: readonly Node[];
  delegatedListeners: readonly DelegatedListenerEntrySnapshot[];
  domCaptured: boolean;
  formControl: FormControlSnapshot | null;
  keyedMap: Map<string | number, Element> | undefined;
  listeners: readonly ListenerEntrySnapshot[];
  reactiveProps: readonly ReactivePropEntrySnapshot[];
  ref: unknown;
  textNodes: readonly TextSnapshot[];
}

// Rollback only reads these collections. Populated records still own their
// copies; sharing the immutable empty case avoids per-element empty arrays.
const EMPTY_SNAPSHOT_ENTRIES: readonly never[] = Object.freeze([]);

function collectTextSnapshots(root: Element): readonly TextSnapshot[] {
  let snapshots: TextSnapshot[] | undefined;
  const children = root.childNodes;
  for (
    let index = 0, node = children.item(0);
    node;
    node = children.item(++index)
  ) {
    if (node.nodeType === 3) {
      const text = node as Text;
      (snapshots ??= []).push({ node: text, data: text.data });
    }
  }
  return snapshots ?? EMPTY_SNAPSHOT_ENTRIES;
}

function getFormControlSnapshot(element: Element): FormControlSnapshot | null {
  const control = element as Element & {
    value?: unknown;
    checked?: unknown;
  };
  let snapshot: FormControlSnapshot | null = null;

  if ('value' in control) {
    snapshot = { value: String(control.value ?? '') };
  }

  if ('checked' in control) {
    (snapshot ??= {}).checked = Boolean(control.checked);
  }

  return snapshot;
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

function copyRetainedAttributes(
  attributes: NamedNodeMap
): ReadonlyArray<[string, string]> {
  let attribute = attributes.item(0);
  if (!attribute) return EMPTY_SNAPSHOT_ENTRIES;
  const result: Array<[string, string]> = [];
  for (let index = 0; attribute; attribute = attributes.item(++index)) {
    result.push([attribute.name, attribute.value]);
  }
  return result;
}

function copyRetainedChildNodes(
  children: NodeListOf<ChildNode>
): readonly Node[] {
  let child = children.item(0);
  if (!child) return EMPTY_SNAPSHOT_ENTRIES;
  const result: Node[] = [];
  for (let index = 0; child; child = children.item(++index)) result.push(child);
  return result;
}

function copyRetainedDelegatedListeners(
  listeners: NonNullable<ReturnType<typeof getDelegatedHandlersForElement>>
): DelegatedListenerEntrySnapshot[] {
  const result: DelegatedListenerEntrySnapshot[] = [];
  listeners.forEach((entry, eventName) =>
    result.push({
      eventName,
      handler: entry.handler,
      original: entry.original,
      options: entry.options,
    })
  );
  return result;
}

function copyRetainedListeners(
  listeners: Map<string, ListenerMapEntry>
): ListenerEntrySnapshot[] {
  const result: ListenerEntrySnapshot[] = [];
  listeners.forEach((entry, listenerKey) =>
    result.push({ listenerKey, entry: cloneListenerEntry(entry) })
  );
  return result;
}

function copyRetainedReactiveProps(
  props: Map<string, ReactivePropCleanupEntry>
): ReactivePropEntrySnapshot[] {
  const result: ReactivePropEntrySnapshot[] = [];
  props.forEach((entry, propName) =>
    result.push({ propName, entry: cloneReactivePropEntry(entry) })
  );
  return result;
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
      ? EMPTY_SNAPSHOT_ENTRIES
      : copyRetainedAttributes(element.attributes),
    childNodes: bindingsOnly
      ? EMPTY_SNAPSHOT_ENTRIES
      : copyRetainedChildNodes(element.childNodes),
    delegatedListeners: delegatedHandlerMap
      ? copyRetainedDelegatedListeners(delegatedHandlerMap)
      : EMPTY_SNAPSHOT_ENTRIES,
    domCaptured: !bindingsOnly,
    formControl: bindingsOnly ? null : getFormControlSnapshot(element),
    keyedMap: keyedMap && new Map(keyedMap),
    listeners: listenerMap
      ? copyRetainedListeners(listenerMap)
      : EMPTY_SNAPSHOT_ENTRIES,
    reactiveProps: reactivePropMap
      ? copyRetainedReactiveProps(reactivePropMap)
      : EMPTY_SNAPSHOT_ENTRIES,
    ref: elementRefs.get(element),
    textNodes: bindingsOnly
      ? EMPTY_SNAPSHOT_ENTRIES
      : collectTextSnapshots(element),
  };
}

function sameChildOrder(
  element: Element,
  childNodes: readonly Node[]
): boolean {
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
  try {
    setRef(ref as Ref<T>, value);
  } catch {
    // Rollback must preserve the original render error.
  }
}

function restoreRef(element: Element, snapshot: RetainedElementSnapshot): void {
  const currentRef = elementRefs.get(element);
  if (currentRef === snapshot.ref) return;

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
  const enclosing = getCurrentCommitTransaction();
  const transaction = enclosing ?? beginCommitTransaction();
  try {
    if (!transaction.hasResource(element)) {
      const snapshot = transaction.captureResource(
        element,
        snapshotRetainedElement(element, bindingsOnly)
      );
      registerCommitRollback(() =>
        restoreRetainedElement(element, snapshot, cleanupRangeNode)
      );
    }
    applyTransaction(transaction, update);
    if (!enclosing) commitTransaction(transaction);
  } catch (error) {
    onError?.();
    throw error;
  } finally {
    if (!enclosing) {
      discardTransaction(transaction);
      suspendTransaction(transaction);
    }
  }
}
