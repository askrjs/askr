/**
 * mergeProps
 *
 * Deterministic props merging.
 * - For non-handlers: `base` overwrites `injected`.
 * - A `base` value of `undefined` means "not provided" and never overwrites an
 *   `injected` value; pass `null` to clear an injected prop explicitly.
 * - For handlers present in both: handlers are composed with `injected` running
 *   first; it may call `preventDefault()` to suppress the `base` handler.
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Merge Strategy
 *    Base props overwrite injected props (base wins).
 *    Exception: Event handlers are composed, not overwritten.
 *
 * 2. Event Handler Detection
 *    Keys starting with "on" are treated as event handlers.
 *    This matches JSX conventions.
 *
 * 3. Handler Composition Order
 *    Injected handler runs first, base handler second.
 *    This allows injected handlers to prevent default.
 *
 * 4. Undefined Means Absent
 *    A `base` key whose value is `undefined` does not override `injected`.
 *    Forwarding an optional prop that was not supplied
 *    (`onClick={props.onClick}`) must not wipe injected behaviour or ARIA.
 *    `null` is an explicit value and still overrides (base wins).
 *
 * 5. Return Type
 *    Returns intersection type (TInjected & TBase) for type safety.
 */
import { composeHandlers } from './compose-handlers';

type Fn = (...args: readonly unknown[]) => void;

function isEventHandlerKey(key: string): boolean {
  return key.startsWith('on');
}

/**
 * Merge `base` props over `injected` props: non-handler keys in `base` win,
 * and matching event handlers are composed (`injected` runs first). `base`
 * values that are `undefined` are treated as absent and never overwrite an
 * injected value; use `null` to clear one explicitly.
 */
export function mergeProps<TBase extends object, TInjected extends object>(
  base: TBase,
  injected: TInjected
): TInjected & TBase {
  // Fast path: if base is empty, return injected as-is
  const baseKeys = Object.keys(base);
  if (baseKeys.length === 0) {
    return injected as TInjected & TBase;
  }

  const out = { ...(injected as object) } as TInjected & TBase;

  for (const key of baseKeys as Array<Extract<keyof TBase, string>>) {
    const baseValue = (base as Record<string, unknown>)[key];
    const injectedValue = (injected as Record<string, unknown>)[key];

    // `undefined` means "not provided": keep whatever was injected.
    if (baseValue === undefined && key in out) continue;

    if (
      isEventHandlerKey(key) &&
      typeof baseValue === 'function' &&
      typeof injectedValue === 'function'
    ) {
      // Invariant: injected runs first; it may call preventDefault() to
      // suppress base behaviour.
      (out as Record<string, unknown>)[key] = composeHandlers(
        injectedValue as unknown as Fn,
        baseValue as unknown as Fn
      );
      continue;
    }

    (out as Record<string, unknown>)[key] = baseValue;
  }

  return out;
}
