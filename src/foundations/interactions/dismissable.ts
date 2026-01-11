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

import type {
  KeyboardLikeEvent,
  PointerLikeEvent,
} from '../utilities/eventTypes';

export function dismissable({ onDismiss, disabled }: DismissableOptions) {
  return {
    // Prop for the component root to handle Escape
    onKeyDown: disabled
      ? undefined
      : (e: KeyboardLikeEvent) => {
          if (e.key === 'Escape') {
            e.preventDefault?.();
            e.stopPropagation?.();
            onDismiss?.();
          }
        },

    // Factory: runtime should attach this listener at the appropriate scope.
    outsideListener: disabled
      ? undefined
      : (isInside: (target: unknown) => boolean) => (e: PointerLikeEvent) => {
          if (!isInside(e.target)) {
            e.preventDefault?.();
            e.stopPropagation?.();
            onDismiss?.();
          }
        },
  };
}
