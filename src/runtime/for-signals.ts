import type { ChildScope } from './child-scope';
import type { ComponentInstance } from './component';
import {
  markReactivePropsDirtySource,
  markReadableDerivedSubscribersDirty,
  notifyReadableReaders,
  recordReadableRead,
  shouldCoalesceFineGrainedItemReads,
  type ReadableSource,
} from './readable';
import { adjustOwnershipDiagnostic } from './ownership-diagnostics';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

export type ForItemSignal<T> = ReadableSource<T> &
  (() => T) & {
    peek(): T;
    set(newValue: T, notifyReaders?: boolean): void;
  };

export type ForItemPropertySignal = ReadableSource<unknown> &
  (() => unknown) & {
    peek(): unknown;
    set(newValue: unknown, notifyReaders?: boolean): void;
  };

export type ForIndexSignal = ReadableSource<number> &
  (() => number) & {
    peek(): number;
    set(
      newValue: number | ((prev: number) => number),
      notifyReaders?: boolean
    ): void;
  };

type MutableForSignal<T> = ReadableSource<T> & {
  _value: T;
};

function peekForSignal<T>(this: MutableForSignal<T>): T {
  return this._value;
}

function setForValueSignal<T>(
  this: MutableForSignal<T>,
  newValue: T,
  notifyReaders = true
): void {
  if (Object.is(this._value, newValue)) {
    return;
  }

  this._value = newValue;
  if (notifyReaders) {
    notifyForSignalReaders(this);
  }
}

function setForIndexValue(
  this: MutableForSignal<number>,
  newValue: number | ((prev: number) => number),
  notifyReaders = true
): void {
  const nextValue =
    typeof newValue === 'function' ? newValue(this._value) : newValue;
  if (nextValue === this._value) {
    return;
  }

  this._value = nextValue;
  if (notifyReaders) {
    notifyForSignalReaders(this);
  }
}

export function notifyForSignalReaders(
  source: ReadableSource<unknown>,
  skipInstance?: ComponentInstance | null,
  skipOwnedBy?: ComponentInstance | null
): void {
  markReadableDerivedSubscribersDirty(source);
  markReactivePropsDirtySource(source);
  notifyReadableReaders(source, skipInstance, skipOwnedBy);
}

export function createForIndexSignal(initialIndex: number): ForIndexSignal {
  function readIndexSignal(): number {
    const signal = readIndexSignal as ForIndexSignal & MutableForSignal<number>;
    signal._hasBeenRead = true;
    recordReadableRead(signal);
    return signal._value;
  }

  const indexSignal = readIndexSignal as ForIndexSignal &
    MutableForSignal<number>;
  indexSignal._value = initialIndex;
  indexSignal.peek = peekForSignal;
  indexSignal.set = setForIndexValue;
  indexSignal._hasBeenRead = false;

  return indexSignal;
}

export function syncForIndexSignal(
  indexSignal: ForIndexSignal,
  nextIndex: number
): boolean {
  if (indexSignal.peek() === nextIndex) {
    return false;
  }

  indexSignal.set(nextIndex, indexSignal._hasBeenRead);
  return indexSignal._hasBeenRead === true;
}

export function createForItemSignal<T>(initialItem: T): ForItemSignal<T> {
  function readItemSignal(): T {
    const signal = readItemSignal as ForItemSignal<T> & MutableForSignal<T>;
    signal._hasBeenRead = true;
    recordReadableRead(signal);
    return signal._value;
  }

  const itemSignal = readItemSignal as ForItemSignal<T> & MutableForSignal<T>;
  itemSignal._value = initialItem;
  itemSignal.peek = peekForSignal;
  itemSignal.set = setForValueSignal;
  itemSignal._hasBeenRead = false;

  return itemSignal;
}

function createForItemPropertySignal(
  initialValue: unknown
): ForItemPropertySignal {
  function readPropertySignal(): unknown {
    const signal = readPropertySignal as ForItemPropertySignal &
      MutableForSignal<unknown>;
    signal._hasBeenRead = true;
    recordReadableRead(signal);
    return signal._value;
  }

  const propertySignal = readPropertySignal as ForItemPropertySignal &
    MutableForSignal<unknown>;
  propertySignal._value = initialValue;
  propertySignal.peek = peekForSignal;
  propertySignal.set = setForValueSignal;
  propertySignal._hasBeenRead = false;

  return propertySignal;
}

export function readForItemProperty(item: unknown, prop: PropertyKey): unknown {
  return Reflect.get(Object(item), prop);
}

export function haveSameOwnKeys(
  previousItem: unknown,
  nextItem: unknown
): boolean {
  const previousKeys = Reflect.ownKeys(Object(previousItem));
  const nextKeys = Reflect.ownKeys(Object(nextItem));

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (let i = 0; i < previousKeys.length; i += 1) {
    if (previousKeys[i] !== nextKeys[i]) {
      return false;
    }
  }

  return true;
}

export function scopeReadsSource(
  scope: ChildScope,
  source: ReadableSource<unknown>
): boolean {
  const readers = source._readers;
  if (!readers || readers.size === 0) {
    return false;
  }

  for (const reader of readers.keys()) {
    let current: ComponentInstance | null = reader;
    while (current) {
      if (current === scope.componentInstance) {
        return true;
      }
      current = current.parentInstance;
    }
  }
  return false;
}

export function scopeDirectlyReadsSource(
  scope: ChildScope,
  source: ReadableSource<unknown>
): boolean {
  return source._readers?.has(scope.componentInstance) ?? false;
}

function isForParentReader(
  parentInstance: ComponentInstance | null,
  reader: ComponentInstance
): boolean {
  let current = parentInstance;

  while (current) {
    if (current === reader) {
      return true;
    }
    current = current.parentInstance;
  }

  return false;
}

export function removeForParentReaders(
  parentInstance: ComponentInstance | null,
  source: ReadableSource<unknown>
): void {
  const readers = source._readers;
  if (!readers || readers.size === 0) {
    return;
  }

  for (const reader of readers.keys()) {
    if (isForParentReader(parentInstance, reader)) {
      if (readers.delete(reader) && __ASKR_DEVELOPMENT_BUILD__) {
        adjustOwnershipDiagnostic('readableReaders', -1);
      }
    }
  }
}

function getOrCreateForItemPropertySignal<T>(
  state: ReactiveForItemState<T>,
  prop: PropertyKey
): ForItemPropertySignal {
  const item = state.currentItem;
  const propertySignals =
    state.propertySignals ??
    (state.propertySignals = new Map<PropertyKey, ForItemPropertySignal>());
  const existingSignal = propertySignals.get(prop);
  if (existingSignal) {
    return existingSignal;
  }

  const propertySignal = createForItemPropertySignal(
    readForItemProperty(item, prop)
  );
  propertySignals.set(prop, propertySignal);
  return propertySignal;
}

export function canProxyForItem(item: unknown): item is object {
  return (
    typeof item === 'function' ||
    (typeof item === 'object' && item !== null && !Array.isArray(item))
  );
}

export interface ReactiveForItemState<T> {
  currentItem: T;
  itemSignal: ForItemSignal<T> | null;
  propertySignals: Map<PropertyKey, ForItemPropertySignal> | null;
  coalescedProperties: PropertyKey | PropertyKey[] | null;
  coalescedProperty2: PropertyKey | null;
  wholeItemRead: boolean;
  proxy: T;
}

export function createReactiveForItem<T>(item: T): ReactiveForItemState<T> {
  const target = Object.create(null) as ReactiveForItemTarget;
  const state = {
    currentItem: item,
    itemSignal: null,
    propertySignals: null,
    coalescedProperties: null,
    coalescedProperty2: null,
    wholeItemRead: false,
    proxy: undefined as T,
  } satisfies ReactiveForItemState<T>;
  target[REACTIVE_FOR_ITEM_STATE] = state as ReactiveForItemState<unknown>;
  state.proxy = new Proxy(target, REACTIVE_FOR_ITEM_PROXY_HANDLER) as T;
  return state;
}

const REACTIVE_FOR_ITEM_STATE = Symbol('askr.reactive-for-item-state');
type ReactiveForItemTarget = Record<string | symbol, unknown> & {
  [REACTIVE_FOR_ITEM_STATE]: ReactiveForItemState<unknown>;
};

function getReactiveForItemState(
  target: ReactiveForItemTarget
): ReactiveForItemState<unknown> {
  return target[REACTIVE_FOR_ITEM_STATE];
}

function getWholeItemSignal(
  state: ReactiveForItemState<unknown>
): ForItemSignal<unknown> {
  let signal = state.itemSignal;
  if (!signal) {
    signal = createForItemSignal(state.currentItem);
    state.itemSignal = signal;
  }
  return signal;
}

const REACTIVE_FOR_ITEM_PROXY_HANDLER: ProxyHandler<ReactiveForItemTarget> = {
  get(target, prop, receiver) {
    if (prop !== REACTIVE_FOR_ITEM_STATE && prop in target) {
      return Reflect.get(target, prop, receiver);
    }

    const metadata = getReactiveForItemState(target);
    const currentItem = metadata.currentItem;
    if (typeof prop !== 'symbol') {
      if (shouldCoalesceFineGrainedItemReads()) {
        const properties = metadata.coalescedProperties;
        if (properties === null) {
          metadata.coalescedProperties = prop;
        } else if (Array.isArray(properties)) {
          if (!properties.includes(prop)) {
            properties.push(prop);
          }
        } else if (
          properties !== prop &&
          metadata.coalescedProperty2 !== prop
        ) {
          if (metadata.coalescedProperty2 === null) {
            metadata.coalescedProperty2 = prop;
          } else {
            metadata.coalescedProperties = [
              properties,
              metadata.coalescedProperty2,
              prop,
            ];
            metadata.coalescedProperty2 = null;
          }
        }

        let itemSignal = metadata.itemSignal;
        if (!itemSignal) {
          itemSignal = createForItemSignal(currentItem);
          metadata.itemSignal = itemSignal;
        }
        itemSignal();
        return readForItemProperty(currentItem, prop);
      }
      return getOrCreateForItemPropertySignal(metadata, prop)();
    }

    metadata.wholeItemRead = true;
    recordReadableRead(getWholeItemSignal(metadata));
    return Reflect.get(Object(currentItem), prop, receiver);
  },
  has(target, prop) {
    if (prop === REACTIVE_FOR_ITEM_STATE) {
      return false;
    }
    const metadata = getReactiveForItemState(target);
    metadata.wholeItemRead = true;
    const itemSignal = getWholeItemSignal(metadata);
    recordReadableRead(itemSignal);
    return prop in target || prop in Object(metadata.currentItem);
  },
  ownKeys(target) {
    const metadata = getReactiveForItemState(target);
    metadata.wholeItemRead = true;
    const itemSignal = getWholeItemSignal(metadata);
    recordReadableRead(itemSignal);
    const keys = new Set<string | symbol>();
    for (const key of Reflect.ownKeys(target)) {
      if (key !== REACTIVE_FOR_ITEM_STATE) {
        keys.add(key);
      }
    }
    for (const key of Reflect.ownKeys(Object(metadata.currentItem))) {
      keys.add(key);
    }
    return Array.from(keys);
  },
  getOwnPropertyDescriptor(target, prop) {
    if (prop === REACTIVE_FOR_ITEM_STATE) {
      return undefined;
    }
    const metadata = getReactiveForItemState(target);
    metadata.wholeItemRead = true;
    const itemSignal = getWholeItemSignal(metadata);
    recordReadableRead(itemSignal);
    const ownDescriptor = Reflect.getOwnPropertyDescriptor(target, prop);
    if (ownDescriptor) {
      return ownDescriptor;
    }
    return Object.getOwnPropertyDescriptor(Object(metadata.currentItem), prop);
  },
  getPrototypeOf(target) {
    const metadata = getReactiveForItemState(target);
    metadata.wholeItemRead = true;
    const itemSignal = getWholeItemSignal(metadata);
    recordReadableRead(itemSignal);
    return Object.getPrototypeOf(Object(metadata.currentItem));
  },
};
