/**
 * mergeProps
 *
 * Deterministic props merging.
 * - For non-handlers: `base` overwrites `injected`.
 * - For handlers present in both: handlers are composed with `injected` running
 *   first; it may call `preventDefault()` to suppress the `base` handler.
 */
import { composeHandlers } from './composeHandlers';

type Fn = (...args: readonly unknown[]) => void;

function isEventHandlerKey(key: string): boolean {
  return key.startsWith('on');
}

export function mergeProps<TBase extends object, TInjected extends object>(
  base: TBase,
  injected: TInjected
): TInjected & TBase {
  const out = { ...(injected as object) } as TInjected & TBase;

  for (const key of Object.keys(base) as Array<Extract<keyof TBase, string>>) {
    const baseValue = (base as Record<string, unknown>)[key];
    const injectedValue = (injected as Record<string, unknown>)[key];

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
