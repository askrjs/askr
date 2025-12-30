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
  onPress?: (e: Event) => void;
  /**
   * Whether the host is a native button. Defaults to false.
   */
  isNativeButton?: boolean;
}

export interface PressableResult {
  onClick: (e: Event) => void;
  role?: string;
  tabIndex?: number;
  onKeyDown?: (e: KeyboardEvent) => void;
  onKeyUp?: (e: KeyboardEvent) => void;
  'aria-disabled'?: 'true';
  [key: string]: any;
}

export function pressable({
  disabled,
  onPress,
  isNativeButton = false,
}: PressableOptions): PressableResult {
  const props: Record<string, any> = {};

  // Click activation delegates directly to onPress. We do not synthesize events.
  props.onClick = (e: Event) => {
    if (disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onPress?.(e);
  };

  if (!isNativeButton) {
    props.role = 'button';
    props.tabIndex = disabled ? -1 : 0;

    // Enter: activate on keydown
    props.onKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onPress?.(e);
      }

      // For Space we prevent default on keydown to avoid page scrolling.
      if (e.key === ' ') {
        e.preventDefault();
      }
    };

    // Space: activate on keyup (matching native button semantics)
    props.onKeyUp = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.key === ' ') {
        e.preventDefault();
        onPress?.(e);
      }
    };
  }

  if (disabled && !isNativeButton) {
    props['aria-disabled'] = 'true';
  }

  return props;
}
