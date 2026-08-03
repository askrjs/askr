const DEFERRED_VALUE = Symbol.for('@askrjs/askr/deferred-value');
export const DEFERRED_BOUNDARY = Symbol.for('@askrjs/askr/deferred-boundary');

export type DeferredState = 'pending' | 'fulfilled' | 'rejected';

export interface Deferred<T> {
  readonly state: DeferredState;
  readonly value: T | undefined;
  readonly error: unknown;
  readonly promise: Promise<T>;
  readonly [DEFERRED_VALUE]: true;
}

export function defer<T>(promise: PromiseLike<T>): Deferred<T> {
  let state: DeferredState = 'pending';
  let value: T | undefined;
  let error: unknown;
  const normalized = Promise.resolve(promise);
  void normalized.then(
    (resolved) => {
      state = 'fulfilled';
      value = resolved;
    },
    (reason) => {
      state = 'rejected';
      error = reason;
    }
  );

  return Object.freeze(
    Object.defineProperties(
      {},
      {
        state: { enumerable: true, get: () => state },
        value: { enumerable: true, get: () => value },
        error: { enumerable: true, get: () => error },
        promise: { value: normalized },
        [DEFERRED_VALUE]: { value: true },
      }
    )
  ) as Deferred<T>;
}

export function isDeferred<T = unknown>(value: unknown): value is Deferred<T> {
  if (!value || typeof value !== 'object') return false;
  const marker = Object.getOwnPropertyDescriptor(value, DEFERRED_VALUE);
  return Boolean(marker && 'value' in marker && marker.value === true);
}

/** @internal Reconstruct settled server data without importing deferred rendering. */
export function reviveDeferredValue<T>(
  state: 'fulfilled' | 'rejected',
  value: T | undefined,
  error: unknown
): Deferred<T> {
  const promise =
    state === 'fulfilled' ? Promise.resolve(value as T) : Promise.reject(error);
  if (state === 'rejected') void promise.catch(() => undefined);
  return Object.freeze(
    Object.defineProperties(
      {},
      {
        state: { enumerable: true, value: state },
        value: { enumerable: true, value },
        error: { enumerable: true, value: error },
        promise: { value: promise },
        [DEFERRED_VALUE]: { value: true },
      }
    )
  ) as Deferred<T>;
}
