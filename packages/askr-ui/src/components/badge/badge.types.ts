import type { BoxAsChildProps, BoxProps } from '../_internal/types';

export type BadgeOwnProps = {
  children?: unknown;
};

export type BadgeProps = BoxProps<'span', HTMLSpanElement> & BadgeOwnProps;
export type BadgeAsChildProps = BoxAsChildProps & BadgeOwnProps;
