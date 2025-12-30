/**
 * composeHandlers
 *
 * Compose two event handlers into one. The first handler runs, and unless it
 * calls `event.preventDefault()` (or sets `defaultPrevented`), the second
 * handler runs. This prevents accidental clobbering of child handlers when
 * injecting props.
 */

export interface ComposeHandlersOptions {
  /**
   * When true (default), do not run the second handler if the first prevented default.
   * When false, always run both handlers.
   */
  checkDefaultPrevented?: boolean;
}

function isDefaultPrevented(
  value: unknown
): value is { defaultPrevented: true } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'defaultPrevented' in value &&
    (value as { defaultPrevented?: boolean }).defaultPrevented === true
  );
}

export function composeHandlers<A extends readonly unknown[]>(
  first?: (...args: A) => void,
  second?: (...args: A) => void,
  options?: ComposeHandlersOptions
): (...args: A) => void {
  const checkDefaultPrevented = options?.checkDefaultPrevented !== false;

  return function composed(...args: A) {
    if (typeof first === 'function') first(...args);

    if (checkDefaultPrevented) {
      if (isDefaultPrevented(args[0])) {
        return;
      }
    }

    if (typeof second === 'function') second(...args);
  } as (...args: A) => void;
}
