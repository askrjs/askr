import { Slot, focusable, mergeProps } from '@askrjs/askr/foundations';
import type { InputAsChildProps, InputInputProps } from './input.types';

export function Input(props: InputInputProps): JSX.Element;
export function Input(props: InputAsChildProps): JSX.Element;
export function Input(props: InputInputProps | InputAsChildProps) {
  const { asChild, children, disabled = false, ref, tabIndex, ...rest } = props;

  const focusProps = focusable({ disabled, tabIndex });
  const finalProps = mergeProps(rest, {
    ...focusProps,
    'data-slot': 'input',
    'data-disabled': disabled ? 'true' : undefined,
    ref,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <input {...finalProps} disabled={disabled} />;
}
