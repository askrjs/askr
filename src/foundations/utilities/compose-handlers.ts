/**
 * composeHandlers
 *
 * Compose two event handlers into one. The first handler runs, and unless it
 * calls `event.preventDefault()` (or sets `defaultPrevented`), the second
 * handler runs. This prevents accidental clobbering of child handlers when
 * injecting props.
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Execution Order
 *    First handler runs before second (injected before base).
 *    This allows injected handlers to prevent default behavior.
 *
 * 2. Default Prevention Check
 *    By default, checks `defaultPrevented` on first argument.
 *    Can be disabled via options.checkDefaultPrevented = false.
 *
 * 3. Undefined Handler Support
 *    Undefined handlers are skipped (no-op). This simplifies usage
 *    where handlers are optional.
 *
 * 4. Type Safety
 *    Args are readonly to prevent mutation. Return type matches input.
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
  // Fast path: if neither handler exists, return stable no-op
  if (!first && !second) {
    return noop as (...args: A) => void;
  }

  // Fast path: if only one handler exists, return it directly
  if (!first) return second!;
  if (!second) return first;

  // Composition path: both handlers exist
  const checkDefaultPrevented = options?.checkDefaultPrevented !== false;

  return function composed(...args: A) {
    first(...args);

    if (checkDefaultPrevented && isDefaultPrevented(args[0])) {
      return;
    }

    second(...args);
  } as (...args: A) => void;
}

// Stable no-op for fast path
function noop() {}
