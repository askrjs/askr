import { Slot, mergeProps } from '@askrjs/askr/foundations';
import type {
  SeparatorAsChildProps,
  SeparatorDivProps,
} from './separator.types';

export function Separator(props: SeparatorDivProps): JSX.Element;
export function Separator(props: SeparatorAsChildProps): JSX.Element;
export function Separator(props: SeparatorDivProps | SeparatorAsChildProps) {
  const {
    asChild,
    children,
    decorative = false,
    orientation = 'horizontal',
    ref,
    ...rest
  } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'separator',
    'data-orientation': orientation,
    role: decorative ? 'presentation' : 'separator',
    'aria-orientation': decorative ? undefined : orientation,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
