import { isDeferred } from './deferred-value';

/** Diagnostic path for an own property of the value at `parent`. */
export function jsonTransportPropertyPath(parent: string, key: string): string {
  if (/^(?:0|[1-9]\d*)$/.test(key)) return `${parent}[${key}]`;
  if (/^[A-Za-z_$][\w$]*$/.test(key)) return `${parent}.${key}`;
  return `${parent}[${JSON.stringify(key)}]`;
}

/** An object awaiting validation; its location is kept for lazy paths. */
type Frame = {
  readonly o: object;
  readonly p: Frame | undefined;
  readonly k: string;
  /** Whether its children were pushed; the next pop leaves it. */
  seen: boolean;
};

/** Format a diagnostic path only when a value actually fails. */
function pathOf(frame: Frame, key?: string): string {
  const keys = key === undefined ? [] : [key];
  for (let at = frame; at.p; at = at.p) keys.push(at.k);
  let path = '$';
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    path = jsonTransportPropertyPath(path, keys[index]);
  }
  return path;
}

function primitiveReason(value: unknown): string | undefined {
  switch (typeof value) {
    case 'number':
      return Number.isFinite(value)
        ? undefined
        : 'non-finite numbers are not supported';
    case 'undefined':
      return 'undefined is not supported';
    case 'bigint':
      return 'bigint is not supported';
    case 'symbol':
      return 'symbols are not supported';
    case 'function':
      return 'functions are not supported';
  }
  return undefined;
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
 * and so on) throws a `TypeError` naming `subject` and the value's path, then
 * `hint`. Accessors are rejected without being invoked. The walk is
 * iterative, so nesting depth is bounded by memory rather than the call
 * stack, and paths are formatted only on failure.
 */
export function validateJsonTransportValue(
  value: unknown,
  subject: string,
  hint: string
): void {
  const fail = (path: string, reason: string): never => {
    throw new TypeError(
      `[Askr] ${subject} at "${path}" is not JSON transport-safe: ${reason}. ${hint}`
    );
  };
  const stack: Frame[] = [];
  const ancestors = new Set<object>();
  const visit = (
    child: unknown,
    parent: Frame | undefined,
    key: string
  ): void => {
    const reason = primitiveReason(child);
    if (reason) fail(parent ? pathOf(parent, key) : '$', reason);
    if (child !== null && typeof child === 'object')
      stack.push({ o: child, p: parent, k: key, seen: false });
  };

  visit(value, undefined, '');
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const object = frame.o;
    if (frame.seen) {
      stack.pop();
      ancestors.delete(object);
      continue;
    }

    // Deferred values carry a symbol marker; plain data has no symbols.
    const hasSymbols = Object.getOwnPropertySymbols(object).length > 0;
    if (hasSymbols && isDeferred(object)) {
      stack.pop();
      if (object.state === 'fulfilled') visit(object.value, frame, 'value');
      continue;
    }

    if (ancestors.has(object))
      fail(pathOf(frame), 'cyclic references are not supported');
    frame.seen = true;
    ancestors.add(object);

    const array = Array.isArray(object) ? (object as unknown[]) : undefined;
    if (!array) {
      const prototype = Object.getPrototypeOf(object);
      if (prototype !== Object.prototype && prototype !== null) {
        fail(
          pathOf(frame),
          `${objectLabel(object)} instances are not supported; use a plain object`
        );
      }
    }
    if (hasSymbols)
      fail(pathOf(frame), 'symbol-keyed properties are not supported');

    const keys = Object.keys(object);
    // A dense array without named properties owns exactly its indices, in
    // order; anything else takes the slow path that names the offender.
    let named = false;
    if (array) {
      const length = array.length;
      if (
        keys.length !== length ||
        (length > 0 && keys[length - 1] !== String(length - 1))
      ) {
        for (let index = 0; index < length; index += 1) {
          if (!(index in array))
            fail(
              pathOf(frame, String(index)),
              'sparse arrays are not supported'
            );
        }
        named = true;
      }
    }
    // Arrays own a non-enumerable `length`; any other hidden property fails.
    const names = Object.getOwnPropertyNames(object);
    if (names.length !== keys.length + (array ? 1 : 0)) {
      for (const name of names) {
        if (!(array && name === 'length') && !keys.includes(name))
          fail(
            pathOf(frame, name),
            'non-enumerable properties are not supported'
          );
      }
    }

    const firstChild = stack.length;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
      if (!('value' in descriptor))
        fail(pathOf(frame, key), 'accessors are not supported');
      if (
        named &&
        (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= array!.length)
      )
        fail(pathOf(frame, key), 'named array properties are not supported');
      visit(descriptor.value, frame, key);
    }
    // Reverse the pushed children so nested objects are also checked in
    // property order.
    for (let low = firstChild, high = stack.length - 1; low < high;) {
      const child = stack[low];
      stack[low++] = stack[high];
      stack[high--] = child;
    }
  }
}
