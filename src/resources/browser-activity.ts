import type { ActivityPredicate, ListenerTarget } from '../runtime';

/** Activity gates retain their permissive server defaults. */
export function documentVisible(): ActivityPredicate {
  return () =>
    typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export function windowFocused(): ActivityPredicate {
  return () =>
    typeof document === 'undefined' ||
    typeof document.hasFocus !== 'function' ||
    document.hasFocus();
}

/** Browser target factories are deferred and skipped during server execution. */
export function resolveListenerTarget(
  target: ListenerTarget
): EventTarget | null {
  return typeof target === 'function'
    ? typeof window === 'undefined'
      ? null
      : (target() ?? null)
    : target;
}
