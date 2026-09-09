export function isPromiseLike<T = unknown>(
  value: unknown
): value is PromiseLike<T> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * Components must return synchronously; async work belongs in `resource()`.
 *
 * The rule was previously enforced by ten hand-written throws carrying three
 * different messages. It is one rule, so it has one message and one guard.
 */
export const ASYNC_COMPONENT_MESSAGE =
  'Async components are not supported. Use resource() for async work.';

export function assertSyncComponentResult(result: unknown): void {
  if (isPromiseLike(result)) {
    throw new Error(ASYNC_COMPONENT_MESSAGE);
  }
}
