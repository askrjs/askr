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
 * Checkbox component prop types
 *
 * ## Type-level Invariants
 * - onClick is PROHIBITED — use onPress instead
 * - checked is controlled state (no onChange, consumer manages state)
 * - asChild discriminates between native input and polymorphic rendering
 * - indeterminate is visual-only and orthogonal to checked state
 *
 * ## Why exclude onClick?
 * onClick doesn't enforce checkbox semantics or disabled state.
 * onPress is handled by pressable foundation which ensures proper behavior.
 */

/**
 * Props shared by all Checkbox variants
 */
export type CheckboxOwnProps = {
  children?: unknown;
  onPress?: (e: PressEvent) => void;
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
};

/**
 * Props when rendering as a native <input type="checkbox"> element
 */
export type CheckboxInputProps = Omit<
  JSX.IntrinsicElements['input'],
  | 'children'
  | 'onClick'
  | 'disabled'
  | 'type'
  | 'ref'
  | 'checked'
  | 'name'
  | 'value'
  | 'required'
> &
  CheckboxOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLInputElement>;
  };

/**
 * Props when rendering via asChild
 */
export type CheckboxAsChildProps = CheckboxOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
};

/**
 * Discriminated union of Checkbox prop types
 */
export type CheckboxProps = CheckboxInputProps | CheckboxAsChildProps;
