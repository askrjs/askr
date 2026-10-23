import {
  Signal,
  getTrackingComputation,
  notifySource,
} from '../reactive/graph';

/**
 * The brand that marks an async snapshot (`resource()`, queries) so
 * `derive(source, map)` can wait for it to settle. The symbol is global so
 * every copy of the package agrees on it.
 */

export const SNAPSHOT_SOURCE_BRAND = Symbol.for('__ASKR_SNAPSHOT_SOURCE__');

export type SnapshotSourceBrand = {
  readonly [SNAPSHOT_SOURCE_BRAND]: true;
};

export function brandSnapshotSource<T extends object>(
  value: T
): T & SnapshotSourceBrand {
  Object.defineProperty(value, SNAPSHOT_SOURCE_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  return value as T & SnapshotSourceBrand;
}

export function isSnapshotSource(value: unknown): value is SnapshotSourceBrand {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as Record<PropertyKey, unknown>)[SNAPSHOT_SOURCE_BRAND] === true
  );
}

/**
 * Turn the data fields of a snapshot object into signal-backed accessors.
 *
 * Reading a field inside a computation subscribes that computation to the
 * field alone, so a component that is handed a snapshot re-renders only when
 * the fields it read change. Writing a field notifies its readers, except
 * the computation doing the write: a write made while the owner renders is
 * part of that render, not a reason to run it again. The object keeps its
 * shape: the same enumerable properties, readable and assignable as before.
 */
export function makeReactiveFields<T extends object>(
  target: T,
  fields: ReadonlyArray<keyof T & string>
): T {
  for (const field of fields) {
    const signal = new Signal<unknown>(
      (target as Record<string, unknown>)[field]
    );
    Object.defineProperty(target, field, {
      enumerable: true,
      configurable: false,
      get: () => signal.read(),
      set: (next: unknown) => {
        // A mutable object assigned again carries new contents (a buffer
        // the source pushed into); only unchanged primitives are skipped.
        if (
          Object.is(signal._value, next) &&
          (typeof next !== 'object' || next === null)
        ) {
          return;
        }
        signal._value = next;
        notifySource(signal, getTrackingComputation() ?? undefined);
      },
    });
  }
  return target;
}
