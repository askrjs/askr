/**
 * dismissable
 *
 * Provides props and helpers to support dismissal behaviour. This helper is
 * runtime-agnostic:
 * - It returns `onKeyDown` prop which will call onDismiss when Escape is
 *   pressed.
 * - It also provides `outsideListener` factory which given an `isInside`
 *   predicate returns a handler suitable to attach at the document level that
 *   will call onDismiss when the pointerdown target is outside the component.
 */

export interface DismissableOptions {
  onDismiss?: () => void;
  disabled?: boolean;
}

export function dismissable({ onDismiss, disabled }: DismissableOptions) {
  return {
    // Prop for the component root to handle Escape
    onKeyDown: disabled
      ? undefined
      : (e: KeyboardEvent) => {
          if ((e as any).key === 'Escape') {
            onDismiss?.();
          }
        },

    // Factory: runtime should call `outsideListener(isInside)` to get a
    // document-level pointerdown handler. `isInside` receives the event target
    // and should return true if the target is inside the component.
    outsideListener: (isInside: (target: any) => boolean) => {
      return disabled
        ? (() => {})
        : (e: { target: any }) => {
            if (!isInside(e.target)) onDismiss?.();
          };
    },
  };
}
