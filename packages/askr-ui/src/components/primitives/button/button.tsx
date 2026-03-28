import { Slot, pressable, mergeProps } from '@askrjs/askr/foundations';
import type { ButtonButtonProps, ButtonAsChildProps } from './button.types';

/**
 * Headless Button component
 *
 * ## Responsibilities
 * - Compose pressable foundation for interaction behavior
 * - Enforce type="button" default to prevent accidental form submission
 * - Forward props and refs to native button or child element
 *
 * ## Non-Responsibilities (delegated to pressable foundation)
 * - Keyboard event handling (Enter/Space)
 * - Pointer event handling
 * - Disabled state enforcement
 * - ARIA attribute application
 *
 * ## Invariants
 * - MUST NOT contain any event handler logic
 * - MUST NOT check disabled prop directly
 * - MUST use pressable() for ALL interaction behavior
 * - MUST use mergeProps() for ALL prop composition
 *
 * @example Native button (prevents accidental submit)
 * ```tsx
 * <Button onPress={handleSave}>Save</Button>
 * ```
 *
 * @example Explicit form submission
 * ```tsx
 * <Button type="submit" onPress={handleSubmit}>Submit</Button>
 * ```
 *
 * @example Polymorphic rendering (asChild)
 * ```tsx
 * <Button asChild onPress={handleNav}>
 *   <a href="/home">Home</a>
 * </Button>
 * ```
 */
export function Button(props: ButtonButtonProps): JSX.Element;
export function Button(props: ButtonAsChildProps): JSX.Element;
export function Button(props: ButtonButtonProps | ButtonAsChildProps) {
  const {
    asChild,
    children,
    onPress,
    type: typeProp,
    disabled = false,
    variant,
    size,
    ref,
    ...rest
  } = props;

  // Foundation delegation: ALL interaction behavior comes from pressable
  const interactionProps = pressable({
    disabled,
    onPress,
    isNativeButton: !asChild,
  });

  // Prop composition: merge user props, interaction props, and ref
  const finalProps = mergeProps(rest, {
    ...interactionProps,
    'data-slot': 'button',
    'data-disabled': disabled ? 'true' : undefined,
    'data-variant': variant && variant !== 'default' ? variant : undefined,
    'data-size': size && size !== 'md' ? size : undefined,
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
