import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type SwitchOwnProps = {
  children?: unknown;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
};

export type SwitchButtonProps = Omit<
  JSX.IntrinsicElements['button'],
  'children' | 'onClick' | 'type' | 'ref'
> &
  SwitchOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLButtonElement>;
    type?: 'button' | 'submit' | 'reset';
  };

export type SwitchAsChildProps = SwitchOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
  type?: never;
};

export type SwitchProps = SwitchButtonProps | SwitchAsChildProps;
