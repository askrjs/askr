import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type FocusRingOwnProps = {
  children?: unknown;
};

export type FocusRingProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> &
  FocusRingOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLDivElement>;
  };

export type FocusRingAsChildProps = FocusRingOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
};
