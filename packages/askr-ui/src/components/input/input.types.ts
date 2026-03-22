import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type InputOwnProps = {
  children?: unknown;
  disabled?: boolean;
  tabIndex?: number;
};

export type InputInputProps = Omit<
  JSX.IntrinsicElements['input'],
  'children' | 'ref'
> &
  InputOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLInputElement>;
  };

export type InputAsChildProps = InputOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
};

export type InputProps = InputInputProps | InputAsChildProps;
