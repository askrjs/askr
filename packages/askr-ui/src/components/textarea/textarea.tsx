import { Slot, focusable, mergeProps } from '@askrjs/askr/foundations';
import type {
  TextareaAsChildProps,
  TextareaElementProps,
} from './textarea.types';

export function Textarea(props: TextareaElementProps): JSX.Element;
export function Textarea(props: TextareaAsChildProps): JSX.Element;
export function Textarea(props: TextareaElementProps | TextareaAsChildProps) {
  const { asChild, children, disabled = false, ref, tabIndex, ...rest } = props;

  const focusProps = focusable({ disabled, tabIndex });
  const finalProps = mergeProps(rest, {
    ...focusProps,
    'data-slot': 'textarea',
    'data-disabled': disabled ? 'true' : undefined,
    ref,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return (
    <textarea {...finalProps} disabled={disabled}>
      {children}
    </textarea>
  );
}
