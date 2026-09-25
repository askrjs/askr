import { isDeferred } from './deferred-value';

/** Report a value that cannot cross the hydration JSON transport unchanged. */
export type JsonTransportFailure = (path: string, reason: string) => never;

/** Diagnostic path for an own property of the value at `parent`. */
export function jsonTransportPropertyPath(parent: string, key: string): string {
  if (/^(?:0|[1-9]\d*)$/.test(key)) return `${parent}[${key}]`;
  if (/^[A-Za-z_$][\w$]*$/.test(key)) return `${parent}.${key}`;
  return `${parent}[${JSON.stringify(key)}]`;
}

function objectLabel(value: object): string {
  if (value instanceof Date) return 'Date';
  if (value instanceof Map) return 'Map';
  if (value instanceof Set) return 'Set';
  const constructor = value.constructor;
  return typeof constructor === 'function' && constructor.name
    ? constructor.name
    : 'class instance';
}

/**
 * Validate that `value` survives the hydration JSON transport unchanged:
 * `null`, strings, booleans, finite numbers, dense arrays, plain objects, and
 * framework deferred values. Anything `JSON.stringify()` would drop, coerce, or
 * reject (undefined, functions, bigint, `Date`, `Map`, class instances, cycles,
 * and so on) is reported through `fail` with its path.
 */
export function validateJsonTransportValue(
  value: unknown,
  fail: JsonTransportFailure,
  path = '$',
  ancestors = new Set<object>()
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return;

  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      fail(path, 'non-finite numbers are not supported');
    return;
  }
  if (typeof value === 'undefined') fail(path, 'undefined is not supported');
  if (typeof value === 'bigint') fail(path, 'bigint is not supported');
  if (typeof value === 'symbol') fail(path, 'symbols are not supported');
  if (typeof value === 'function') fail(path, 'functions are not supported');

  const object = value as object;
  if (isDeferred(object)) {
    if (object.state === 'fulfilled') {
      validateJsonTransportValue(
        object.value,
        fail,
        `${path}.value`,
        ancestors
      );
    }
    return;
  }

  if (ancestors.has(object)) fail(path, 'cyclic references are not supported');
  ancestors.add(object);

  try {
    if (Array.isArray(object)) {
      for (let index = 0; index < object.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(object, index)) {
          fail(`${path}[${index}]`, 'sparse arrays are not supported');
        }
      }
      for (const key of Reflect.ownKeys(object)) {
        if (key === 'length') continue;
        if (typeof key === 'symbol')
          fail(path, 'symbol-keyed properties are not supported');
        const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
        const childPath = jsonTransportPropertyPath(path, key);
        if (!descriptor.enumerable)
          fail(childPath, 'non-enumerable properties are not supported');
        if (!('value' in descriptor))
          fail(childPath, 'accessors are not supported');
        if (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= object.length)
          fail(childPath, 'named array properties are not supported');
        validateJsonTransportValue(
          descriptor.value,
          fail,
          childPath,
          ancestors
        );
      }
      return;
    }

    const prototype = Object.getPrototypeOf(object);
    if (prototype !== Object.prototype && prototype !== null) {
      fail(
        path,
        `${objectLabel(object)} instances are not supported; use a plain object`
      );
    }

    for (const key of Reflect.ownKeys(object)) {
      if (typeof key === 'symbol')
        fail(path, 'symbol-keyed properties are not supported');
      const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
      const childPath = jsonTransportPropertyPath(path, key);
      if (!descriptor.enumerable)
        fail(childPath, 'non-enumerable properties are not supported');
      if (!('value' in descriptor))
        fail(childPath, 'accessors are not supported');
      validateJsonTransportValue(descriptor.value, fail, childPath, ancestors);
    }
  } finally {
    ancestors.delete(object);
  }
}
