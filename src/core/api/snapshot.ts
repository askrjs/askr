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
