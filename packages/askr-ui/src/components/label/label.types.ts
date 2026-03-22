import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type LabelOwnProps = {
  children?: unknown;
};

export type LabelLabelProps = Omit<
  JSX.IntrinsicElements['label'],
  'children' | 'ref'
> &
  LabelOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLLabelElement>;
  };

export type LabelAsChildProps = LabelOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
};

export type LabelProps = LabelLabelProps | LabelAsChildProps;
