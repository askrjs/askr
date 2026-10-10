/** Capture declaration data without freezing or invoking application-owned values. */
export function snapshotAppMeta(value: unknown): unknown {
  const copies = new WeakMap<object, object>();
  const pending: { source: object; copy: object }[] = [];
  const invalid = () =>
    new TypeError(
      'appMeta requires ordinary record/array data and primitive values; accessors, functions and class instances are unsupported.'
    );

  function clone(input: unknown): unknown {
    if (typeof input === 'function') throw invalid();
    if (input === null || typeof input !== 'object') return input;
    const existing = copies.get(input);
    if (existing) return existing;
    const prototype = Object.getPrototypeOf(input);
    if (
      !Array.isArray(input) &&
      prototype !== Object.prototype &&
      prototype !== null
    )
      throw invalid();
    const copy = Array.isArray(input) ? [] : Object.create(prototype);
    copies.set(input, copy);
    pending.push({ source: input, copy });
    return copy;
  }

  const result = clone(value);
  for (let index = 0; index < pending.length; index++) {
    const { source, copy } = pending[index];
    for (const key of Reflect.ownKeys(source)) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key)!;
      if (!('value' in descriptor)) throw invalid();
      Object.defineProperty(copy, key, {
        ...descriptor,
        value: clone(descriptor.value),
      });
    }
  }
  for (const { copy } of pending) Object.freeze(copy);
  return result;
}
