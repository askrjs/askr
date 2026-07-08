import type { ChildScope } from './child-scope';
import type { ComponentInstance } from './component';
import {
  markReactivePropsDirtySource,
  markReadableDerivedSubscribersDirty,
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from './readable';

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

export function notifyForSignalReaders(
  source: ReadableSource<unknown>,
  skipInstance?: ComponentInstance | null
): void {
  markReadableDerivedSubscribersDirty(source);
  markReactivePropsDirtySource(source);
  notifyReadableReaders(source, skipInstance);
}

export function createForIndexSignal(initialIndex: number): ForIndexSignal {
  let indexValue = initialIndex;
  const readers = new Map<ComponentInstance, number>();

  const indexSignal = (() => {
    indexSignal._hasBeenRead = true;
    recordReadableRead(indexSignal);
    return indexValue;
  }) as ForIndexSignal;
  indexSignal._readers = readers;
  indexSignal.peek = () => indexValue;
  indexSignal.set = (
    newValue: number | ((prev: number) => number),
    notifyReaders = true
  ) => {
    const nextValue =
      typeof newValue === 'function' ? newValue(indexValue) : newValue;
    if (nextValue !== indexValue) {
      indexValue = nextValue;
      if (notifyReaders) {
        notifyForSignalReaders(indexSignal);
      }
    }
  };
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
  let itemValue = initialItem;
  const readers = new Map<ComponentInstance, number>();

  const itemSignal = (() => {
    itemSignal._hasBeenRead = true;
    recordReadableRead(itemSignal);
    return itemValue;
  }) as ForItemSignal<T>;

  itemSignal._readers = readers;
  itemSignal.peek = () => itemValue;
  itemSignal.set = (newValue: T, notifyReaders = true) => {
    if (Object.is(itemValue, newValue)) {
      return;
    }

    itemValue = newValue;
    if (notifyReaders) {
      notifyForSignalReaders(itemSignal);
    }
  };
  itemSignal._hasBeenRead = false;

  return itemSignal;
}

function createForItemPropertySignal(
  initialValue: unknown
): ForItemPropertySignal {
  let propertyValue = initialValue;
  const readers = new Map<ComponentInstance, number>();

  const propertySignal = (() => {
    propertySignal._hasBeenRead = true;
    recordReadableRead(propertySignal);
    return propertyValue;
  }) as ForItemPropertySignal;

  propertySignal._readers = readers;
  propertySignal.peek = () => propertyValue;
  propertySignal.set = (newValue: unknown, notifyReaders = true) => {
    if (Object.is(propertyValue, newValue)) {
      return;
    }

    propertyValue = newValue;
    if (notifyReaders) {
      notifyForSignalReaders(propertySignal);
    }
  };
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
      readers.delete(reader);
    }
  }
}

function getOrCreateForItemPropertySignal<T>(
  item: T,
  propertySignals: Map<PropertyKey, ForItemPropertySignal>,
  prop: PropertyKey
): ForItemPropertySignal {
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

export function createReactiveForItem<T>(
  itemSignal: ForItemSignal<T>,
  propertySignals: Map<PropertyKey, ForItemPropertySignal>
): T {
  const target = Object.create(null) as Record<string | symbol, unknown>;

  return new Proxy(target, {
    get(target, prop, receiver) {
      const ownDescriptor = Reflect.getOwnPropertyDescriptor(target, prop);
      if (ownDescriptor) {
        return Reflect.get(target, prop, receiver);
      }

      const currentItem = itemSignal.peek();

      if (typeof prop !== 'symbol') {
        return getOrCreateForItemPropertySignal(
          currentItem,
          propertySignals,
          prop
        )();
      }

      recordReadableRead(itemSignal);
      return Reflect.get(Object(currentItem), prop, receiver);
    },
    has(target, prop) {
      recordReadableRead(itemSignal);
      return prop in target || prop in Object(itemSignal.peek());
    },
    ownKeys(target) {
      recordReadableRead(itemSignal);
      const keys = new Set<string | symbol>(Reflect.ownKeys(target));
      for (const key of Reflect.ownKeys(Object(itemSignal.peek()))) {
        keys.add(key);
      }

      return Array.from(keys);
    },
    getOwnPropertyDescriptor(target, prop) {
      recordReadableRead(itemSignal);
      const ownDescriptor = Reflect.getOwnPropertyDescriptor(target, prop);
      if (ownDescriptor) {
        return ownDescriptor;
      }

      return Object.getOwnPropertyDescriptor(Object(itemSignal.peek()), prop);
    },
    getPrototypeOf() {
      recordReadableRead(itemSignal);
      return Object.getPrototypeOf(Object(itemSignal.peek()));
    },
  }) as T;
}
