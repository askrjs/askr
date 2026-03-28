import { Slot, mergeProps } from '@askrjs/askr/foundations';
import type {
  VisuallyHiddenAsChildProps,
  VisuallyHiddenSpanProps,
} from './visually-hidden.types';

const visuallyHiddenAttrs = {
  'data-askr-visually-hidden': 'true',
  style: [
    'position:absolute',
    'width:1px',
    'height:1px',
    'padding:0',
    'margin:-1px',
    'overflow:hidden',
    'clip:rect(0, 0, 0, 0)',
    'white-space:nowrap',
    'border:0',
  ].join(';'),
} as const;

export function VisuallyHidden(props: VisuallyHiddenSpanProps): JSX.Element;
export function VisuallyHidden(props: VisuallyHiddenAsChildProps): JSX.Element;
export function VisuallyHidden(
  props: VisuallyHiddenSpanProps | VisuallyHiddenAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, { ...visuallyHiddenAttrs, ref });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <span {...finalProps}>{children}</span>;
}
