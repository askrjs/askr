import type { BoxAsChildProps, BoxProps } from '../../_internal/types';

export type SkeletonOwnProps = {
  children?: unknown;
};

export type SkeletonProps = BoxProps<'div', HTMLDivElement> & SkeletonOwnProps;
export type SkeletonAsChildProps = BoxAsChildProps & SkeletonOwnProps;
