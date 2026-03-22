import type { JSXElement, Ref } from '@askrjs/askr/foundations';

/**
 * Press event passed to onPress handler
 *
 * Compatible with the pressable foundation's PressEvent type.
 */
export type PressEvent = {
  preventDefault?: () => void;
  stopPropagation?: () => void;
  defaultPrevented?: boolean;
};

/**
 * Toggle component prop types
 *
 * ## Type-level Invariants
 * - onClick is PROHIBITED — use onPress instead
 * - pressed is controlled state (no onChange, consumer manages state)
 * - asChild discriminates between native button and polymorphic rendering
 *
 * ## Why exclude onClick?
 * onClick doesn't enforce toggle semantics or disabled state.
 * onPress is handled by pressable foundation which ensures proper behavior.
 */

/**
 * Props shared by all Toggle variants
 */
export type ToggleOwnProps = {
  children?: unknown;
  onPress?: (e: PressEvent) => void;
  pressed?: boolean;
  disabled?: boolean;
};

/**
 * Props when rendering as a native <button> element
 */
export type ToggleButtonProps = Omit<
  JSX.IntrinsicElements['button'],
  'children' | 'onClick' | 'disabled' | 'type' | 'ref'
> &
  ToggleOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLButtonElement>;
    type?: 'button' | 'submit' | 'reset';
  };

/**
 * Props when rendering via asChild
 */
export type ToggleAsChildProps = ToggleOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
  type?: never;
};

/**
 * Discriminated union of Toggle prop types
 */
export type ToggleProps = ToggleButtonProps | ToggleAsChildProps;
