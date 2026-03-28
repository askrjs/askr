import type { JSXElement, Ref } from '@askrjs/askr/foundations';
import type { CheckboxInputProps } from '../../primitives/checkbox';
import type { InputInputProps } from '../../primitives/input';
import type { RadioGroupProps } from '../../primitives/radio-group';
import type { SelectTriggerProps } from '../../primitives/select';
import type { SwitchButtonProps } from '../../primitives/switch';

export type FieldOwnProps = {
  id?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  children?: unknown;
};

export type FieldsetOwnProps = {
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  children?: unknown;
};

export type FieldsetProps = Omit<
  JSX.IntrinsicElements['fieldset'],
  'children' | 'ref'
> &
  FieldsetOwnProps & {
    ref?: Ref<HTMLFieldSetElement>;
  };

export type FieldLegendProps = Omit<
  JSX.IntrinsicElements['legend'],
  'children' | 'ref'
> & {
  children?: unknown;
  ref?: Ref<HTMLLegendElement>;
};

export type FieldRowProps = Omit<
  JSX.IntrinsicElements['label'],
  'children' | 'ref'
> & {
  children?: unknown;
  ref?: Ref<HTMLLabelElement>;
};

export type FieldProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> &
  FieldOwnProps & {
    ref?: Ref<HTMLDivElement>;
  };

export type FieldLabelProps = Omit<
  JSX.IntrinsicElements['label'],
  'children' | 'ref'
> & {
  asChild?: false;
  children?: unknown;
  fieldId?: string;
  ref?: Ref<HTMLLabelElement>;
};

export type FieldLabelAsChildProps = {
  asChild: true;
  children: JSXElement;
  fieldId?: string;
  ref?: Ref<unknown>;
};

export type FieldDescriptionProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref' | 'id'
> & {
  asChild?: false;
  children?: unknown;
  fieldId?: string;
  ref?: Ref<HTMLDivElement>;
};

export type FieldDescriptionAsChildProps = {
  asChild: true;
  children: JSXElement;
  fieldId?: string;
  ref?: Ref<unknown>;
};

export type FieldErrorProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref' | 'id'
> & {
  asChild?: false;
  children?: unknown;
  fieldId?: string;
  ref?: Ref<HTMLDivElement>;
};

export type FieldErrorAsChildProps = {
  asChild: true;
  children: JSXElement;
  fieldId?: string;
  ref?: Ref<unknown>;
};

export type FieldInputProps = Omit<
  InputInputProps,
  | 'id'
  | 'required'
  | 'disabled'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'aria-required'
  | 'aria-disabled'
> & {
  fieldId?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
};

export type FieldSelectTriggerProps = Omit<
  SelectTriggerProps,
  | 'id'
  | 'disabled'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'aria-required'
  | 'aria-disabled'
> & {
  fieldId?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
};

export type FieldCheckboxProps = Omit<
  CheckboxInputProps,
  | 'id'
  | 'disabled'
  | 'required'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'aria-required'
  | 'aria-disabled'
> & {
  fieldId?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
};

export type FieldSwitchProps = Omit<
  SwitchButtonProps,
  | 'id'
  | 'disabled'
  | 'required'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'aria-required'
  | 'aria-disabled'
> & {
  fieldId?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
};

export type FieldRadioGroupProps = Omit<
  RadioGroupProps,
  | 'id'
  | 'disabled'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'aria-required'
  | 'aria-disabled'
> & {
  fieldId?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
};
