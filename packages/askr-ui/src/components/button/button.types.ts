import type { JSXElement, Ref } from '@askrjs/askr/foundations';

/**
 * Press event passed to onPress handler
 *
 * Compatible with the pressable foundation's PressEvent type.
 * Includes preventDefault and stopPropagation for event control.
 */
export type PressEvent = {
  preventDefault?: () => void;
  stopPropagation?: () => void;
  defaultPrevented?: boolean;
};

/**
 * Core Button props shared across all variants
 */
export type ButtonOwnProps = {
  children?: unknown;
  onPress?: (e: PressEvent) => void;
  disabled?: boolean;
};

/**
 * Props when rendering as native <button>
 */
export type ButtonButtonProps = Omit<
  JSX.IntrinsicElements['button'],
  'children' | 'onClick' | 'disabled' | 'type' | 'ref'
> &
  ButtonOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLButtonElement>;
    type?: 'button' | 'submit' | 'reset';
  };

/**
 * Props when rendering with asChild (polymorphic)
 */
export type ButtonAsChildProps = ButtonOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
  type?: never;
};

/**
 * Union of all Button prop variants
 */
export type ButtonProps = ButtonButtonProps | ButtonAsChildProps;
