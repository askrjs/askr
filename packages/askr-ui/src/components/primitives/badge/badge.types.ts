import type { BoxAsChildProps, BoxProps } from '../../_internal/types';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export type BadgeOwnProps = {
  children?: unknown;
  variant?: BadgeVariant;
};

export type BadgeProps = BoxProps<'span', HTMLSpanElement> & BadgeOwnProps;
export type BadgeAsChildProps = BoxAsChildProps & BadgeOwnProps;
