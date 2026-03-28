import { Slot, mergeProps } from '@askrjs/askr/foundations';
import type { BadgeAsChildProps, BadgeProps } from './badge.types';

export function Badge(props: BadgeProps): JSX.Element;
export function Badge(props: BadgeAsChildProps): JSX.Element;
export function Badge(props: BadgeProps | BadgeAsChildProps) {
  const { asChild, children, variant, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'badge',
    'data-badge': 'true',
    'data-variant': variant && variant !== 'default' ? variant : undefined,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <span {...finalProps}>{children}</span>;
}
