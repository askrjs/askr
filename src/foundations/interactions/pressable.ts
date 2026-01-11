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
 * - Disabled: handlers short-circuit and `aria-disabled` is set for all hosts
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Activation Timing (Platform Parity)
 *    - Enter fires on keydown (immediate response)
 *    - Space fires on keyup (allows cancel by moving focus, matches native)
 *    - Space keydown prevents scroll (matches native button behavior)
 *
 * 2. Disabled Enforcement Strategy
 *    - Native buttons: Use HTML `disabled` attribute (platform-enforced non-interactivity)
 *                     AND `aria-disabled` (consistent a11y signaling)
 *    - Non-native: Use `tabIndex=-1` (removes from tab order)
 *                  AND `aria-disabled` (signals disabled state to AT)
 *    - Click handler short-circuits as defense-in-depth (prevents leaked focus issues)
 *
 * 3. Key Repeat Behavior
 *    - Held Enter/Space will fire onPress repeatedly (matches native button)
 *    - No debouncing or repeat prevention (platform parity)
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
import { ariaDisabled } from '../utilities/aria';

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
    if (disabled) {
      props.disabled = true;
      Object.assign(props, ariaDisabled(disabled));
    }
    return props;
  }

  props.role = 'button';
  props.tabIndex = disabled ? -1 : 0;

  props.onKeyDown = (e) => {
    if (disabled) {
      e.preventDefault?.();
      e.stopPropagation?.();
      return;
    }

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
    if (disabled) {
      e.preventDefault?.();
      e.stopPropagation?.();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault?.();
      onPress?.(e);
    }
  };

  if (disabled) Object.assign(props, ariaDisabled(disabled));
  return props;
}
