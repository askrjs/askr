/**
 * pressable
 *
 * Interaction helper that produces VNode props for 'press' semantics.
 * - Pure and deterministic: no DOM construction or mutation here
 * - The runtime owns event attachment and scheduling
 * - This helper returns plain props (handlers) intended to be attached by the runtime
 *
 * Behaviour:
 * - For native buttons: only an `onClick` prop is provided (no ARIA or keyboard shims)
 * - For non-button elements: add `role="button"` and `tabIndex` and keyboard handlers
 * - Activation: `Enter` activates on keydown, `Space` activates on keyup (matches native button)
 * - Disabled: handlers short-circuit and `aria-disabled` is set for non-button hosts
 */

export interface PressableOptions {
  disabled?: boolean;
  onPress?: (e: PressEvent) => void;
  /**
   * Whether the host is a native button. Defaults to false.
   */
  isNativeButton?: boolean;
}

import type {
  DefaultPreventable,
  KeyboardLikeEvent,
  PropagationStoppable,
} from '../utilities/eventTypes';

type PressEvent = DefaultPreventable & PropagationStoppable;

export interface PressableResult {
  onClick: (e: PressEvent) => void;
  disabled?: true;
  role?: 'button';
  tabIndex?: number;
  onKeyDown?: (e: KeyboardLikeEvent) => void;
  onKeyUp?: (e: KeyboardLikeEvent) => void;
  'aria-disabled'?: 'true';
}

export function pressable({
  disabled,
  onPress,
  isNativeButton = false,
}: PressableOptions): PressableResult {
  const props: PressableResult = {
    onClick: (e) => {
      if (disabled) {
        e.preventDefault?.();
        e.stopPropagation?.();
        return;
      }
      onPress?.(e);
    },
  };

  if (isNativeButton) {
    if (disabled) props.disabled = true;
    return props;
  }

  props.role = 'button';
  props.tabIndex = disabled ? -1 : 0;

  props.onKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'Enter') {
      e.preventDefault?.();
      onPress?.(e);
      return;
    }

    if (e.key === ' ') {
      // Prevent scrolling while Space is held.
      e.preventDefault?.();
    }
  };

  props.onKeyUp = (e) => {
    if (disabled) return;
    if (e.key === ' ') {
      e.preventDefault?.();
      onPress?.(e);
    }
  };

  if (disabled) props['aria-disabled'] = 'true';
  return props;
}
