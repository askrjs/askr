import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type FieldOwnProps = {
  id?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  children?: unknown;
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

export type FieldControlProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> & {
  asChild?: false;
  children?: unknown;
  fieldId?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  ref?: Ref<HTMLDivElement>;
};

export type FieldControlAsChildProps = {
  asChild: true;
  children: JSXElement;
  fieldId?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  ref?: Ref<unknown>;
};
