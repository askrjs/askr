import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type PressEvent = {
  preventDefault?: () => void;
  stopPropagation?: () => void;
  defaultPrevented?: boolean;
};

export type ButtonLikeOwnProps = {
  children?: unknown;
  disabled?: boolean;
  onPress?: (event: PressEvent) => void;
};

export type ButtonLikeProps<
  TTag extends keyof JSX.IntrinsicElements,
  TElement,
> = Omit<
  JSX.IntrinsicElements[TTag],
  'children' | 'onClick' | 'disabled' | 'type' | 'ref'
> &
  ButtonLikeOwnProps & {
    asChild?: false;
    ref?: Ref<TElement>;
    type?: 'button' | 'submit' | 'reset';
  };

export type ButtonLikeAsChildProps = ButtonLikeOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
  type?: never;
};

export type BoxOwnProps = {
  children?: unknown;
};

export type BoxProps<TTag extends keyof JSX.IntrinsicElements, TElement> = Omit<
  JSX.IntrinsicElements[TTag],
  'children' | 'ref'
> &
  BoxOwnProps & {
    asChild?: false;
    ref?: Ref<TElement>;
  };

export type BoxAsChildProps = BoxOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
};
