import { Slot, pressable, mergeProps } from '@askrjs/askr/foundations';
import type { ToggleButtonProps, ToggleAsChildProps } from './toggle.types';

/**
 * Headless Toggle component
 *
 * ## Responsibilities
 * - Compose pressable foundation for interaction behavior
 * - Apply aria-pressed for toggle state signaling
 * - Enforce type="button" default to prevent accidental form submission
 * - Forward props and refs to native button or child element
 *
 * ## Non-Responsibilities (delegated to pressable foundation)
 * - Keyboard event handling (Enter/Space)
 * - Pointer event handling
 * - Disabled state enforcement
 * - Role attribute application (for non-native elements)
 *
 * ## Invariants
 * - MUST NOT contain any event handler logic
 * - MUST NOT check disabled or pressed props directly
 * - MUST use pressable() for ALL interaction behavior
 * - MUST use mergeProps() for ALL prop composition
 * - pressed state is CONTROLLED (consumer manages state)
 *
 * @example Native toggle button
 * ```tsx
 * const [pressed, setPressed] = useState(false);
 * <Toggle pressed={pressed} onPress={() => setPressed(!pressed)}>
 *   Mute
 * </Toggle>
 * ```
 *
 * @example Polymorphic rendering (asChild)
 * ```tsx
 * <Toggle asChild pressed={muted} onPress={toggleMute}>
 *   <span>🔇</span>
 * </Toggle>
 * ```
 */
export function Toggle(props: ToggleButtonProps): JSX.Element;
export function Toggle(props: ToggleAsChildProps): JSX.Element;
export function Toggle(props: ToggleButtonProps | ToggleAsChildProps) {
  const {
    asChild,
    children,
    onPress,
    type: typeProp,
    pressed = false,
    disabled = false,
    ref,
    ...rest
  } = props;

  // Foundation delegation: ALL interaction behavior comes from pressable
  const interactionProps = pressable({
    disabled,
    onPress,
    isNativeButton: !asChild,
  });

  // Prop composition: merge user props, interaction props, aria-pressed, and ref
  const finalProps = mergeProps(rest, {
    ...interactionProps,
    'aria-pressed': String(pressed),
    'data-slot': 'toggle',
    'data-disabled': disabled ? 'true' : undefined,
    'data-state': pressed ? 'on' : 'off',
    ref,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  // Explicit type="button" default prevents accidental form submission
  const type = typeProp ?? 'button';
  return (
    <button type={type} {...finalProps}>
      {children}
    </button>
  );
}
