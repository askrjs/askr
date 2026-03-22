import type { JSXElement, Orientation, Ref } from '@askrjs/askr/foundations';

export type RadioGroupOwnProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  name?: string;
  orientation?: Orientation;
  loop?: boolean;
  children?: unknown;
};

export type RadioGroupProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> &
  RadioGroupOwnProps & {
    ref?: Ref<HTMLDivElement>;
  };

export type RadioGroupItemOwnProps = {
  value: string;
  disabled?: boolean;
  children?: unknown;
};

export type RadioGroupItemProps = Omit<
  JSX.IntrinsicElements['button'],
  'children' | 'ref' | 'onClick' | 'type' | 'value'
> &
  RadioGroupItemOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLButtonElement>;
  };

export type RadioGroupItemAsChildProps = RadioGroupItemOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
};
