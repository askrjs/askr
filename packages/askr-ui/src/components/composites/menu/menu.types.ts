import type { Orientation } from '@askrjs/askr/foundations';
import type {
  BoxAsChildProps,
  BoxProps,
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  PressEvent,
} from '../../_internal/types';

export type MenuOwnProps = {
  children?: unknown;
  id?: string;
  orientation?: Orientation;
  loop?: boolean;
};

export type MenuProps = MenuOwnProps;

export type MenuContentProps = BoxProps<'div', HTMLDivElement>;
export type MenuContentAsChildProps = BoxAsChildProps;

export type MenuItemOwnProps = {
  children?: unknown;
  disabled?: boolean;
  onSelect?: (event: PressEvent) => void;
};

export type MenuItemProps = Omit<
  ButtonLikeProps<'button', HTMLButtonElement>,
  'onPress'
> &
  MenuItemOwnProps;

export type MenuItemAsChildProps = Omit<ButtonLikeAsChildProps, 'onPress'> &
  MenuItemOwnProps;

export type MenuGroupProps = BoxProps<'div', HTMLDivElement>;
export type MenuGroupAsChildProps = BoxAsChildProps;

export type MenuLabelProps = BoxProps<'div', HTMLDivElement>;
export type MenuLabelAsChildProps = BoxAsChildProps;

export type MenuSeparatorProps = BoxProps<'div', HTMLDivElement>;
export type MenuSeparatorAsChildProps = BoxAsChildProps;
