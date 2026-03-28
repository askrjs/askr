import { Slot, mergeProps } from '@askrjs/askr/foundations';
import type { SkeletonAsChildProps, SkeletonProps } from './skeleton.types';

export function Skeleton(props: SkeletonProps): JSX.Element;
export function Skeleton(props: SkeletonAsChildProps): JSX.Element;
export function Skeleton(props: SkeletonProps | SkeletonAsChildProps) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'skeleton',
    'data-skeleton': 'true',
    'aria-hidden': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
