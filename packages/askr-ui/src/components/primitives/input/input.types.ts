import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type InputEvent = Event & {
  currentTarget: HTMLInputElement;
  target: HTMLInputElement;
};

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

export type DebouncedInputProps = Omit<InputInputProps, 'onInput' | 'type'> & {
  type?: JSX.IntrinsicElements['input']['type'];
  debounceMs?: number;
  onInput?: (event: InputEvent) => void;
  onDebouncedInput?: (value: string) => void;
};

export type InputProps = InputInputProps | InputAsChildProps;
