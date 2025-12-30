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

export function composeHandlers<A extends any[], R = void>(
  a?: (...args: A) => R,
  b?: (...args: A) => R,
  options?: ComposeHandlersOptions
) {
  const checkDefaultPrevented = options?.checkDefaultPrevented !== false;

  return function composed(...args: A) {
    try {
      if (typeof a === 'function') a(...args);
    } catch (err) {
      // Swallow errors to avoid breaking injected consumers. Re-throw in dev?
      if (process.env.NODE_ENV !== 'production') throw err;
    }

    if (checkDefaultPrevented) {
      const event = (args[0] as unknown) as Event;
      if (
        event &&
        'defaultPrevented' in event &&
        (event as any).defaultPrevented
      ) {
        return;
      }
    }

    try {
      if (typeof b === 'function') b(...args);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') throw err;
    }
  } as (...args: A) => void;
}
