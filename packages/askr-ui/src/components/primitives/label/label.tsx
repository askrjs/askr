import { Slot, mergeProps } from '@askrjs/askr/foundations';
import type { LabelAsChildProps, LabelLabelProps } from './label.types';

export function Label(props: LabelLabelProps): JSX.Element;
export function Label(props: LabelAsChildProps): JSX.Element;
export function Label(props: LabelLabelProps | LabelAsChildProps) {
  if (props.asChild) {
    const { asChild: _asChild, children, ref, ...rest } = props;
    const finalProps = mergeProps(rest, { ref, 'data-slot': 'label' });

    return <Slot asChild {...finalProps} children={children} />;
  }

  const { children, ref, htmlFor, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'label',
    ...(htmlFor !== undefined ? { for: htmlFor } : {}),
  });

  return <label {...finalProps}>{children}</label>;
}
