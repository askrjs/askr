import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type StackOwnProps = {
  /** CSS gap value or named spacing token. Inline style only applied for real CSS lengths. */
  gap?: string;
  /** CSS align-items value. */
  align?: string;
  /** CSS justify-content value. */
  justify?: string;
  /** CSS flex-wrap value. */
  wrap?: 'wrap' | 'nowrap' | 'wrap-reverse';
  children?: unknown;
};

export type StackDivProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> &
  StackOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLDivElement>;
  };

export type StackAsChildProps = StackOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
  style?: JSX.IntrinsicElements['div']['style'];
};

export type StackProps = StackDivProps | StackAsChildProps;
