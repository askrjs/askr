import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type TextareaOwnProps = {
  children?: unknown;
  disabled?: boolean;
  tabIndex?: number;
};

export type TextareaElementProps = Omit<
  JSX.IntrinsicElements['textarea'],
  'children' | 'ref'
> &
  TextareaOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLTextAreaElement>;
  };

export type TextareaAsChildProps = TextareaOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
};

export type TextareaProps = TextareaElementProps | TextareaAsChildProps;
