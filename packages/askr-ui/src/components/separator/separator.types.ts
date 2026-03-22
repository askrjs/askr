import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type SeparatorOwnProps = {
  decorative?: boolean;
  orientation?: 'horizontal' | 'vertical';
  children?: unknown;
};

export type SeparatorDivProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> &
  SeparatorOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLDivElement>;
  };

export type SeparatorAsChildProps = SeparatorOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
};

export type SeparatorProps = SeparatorDivProps | SeparatorAsChildProps;
