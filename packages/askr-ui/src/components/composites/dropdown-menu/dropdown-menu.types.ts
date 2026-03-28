import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxAsChildProps,
  BoxProps,
  PressEvent,
} from '../../_internal/types';
import type { OverlayAlign, OverlaySide } from '../../_internal/overlay';

export type DropdownMenuOwnProps = {
  children?: unknown;
  id?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export type DropdownMenuProps = DropdownMenuOwnProps;

export type DropdownMenuTriggerProps = ButtonLikeProps<
  'button',
  HTMLButtonElement
>;
export type DropdownMenuTriggerAsChildProps = ButtonLikeAsChildProps;

export type DropdownMenuPortalProps = {
  children?: unknown;
};

export type DropdownMenuContentOwnProps = {
  forceMount?: boolean;
  side?: OverlaySide;
  align?: OverlayAlign;
  sideOffset?: number;
};

export type DropdownMenuContentProps = BoxProps<'div', HTMLDivElement> &
  DropdownMenuContentOwnProps;

export type DropdownMenuContentAsChildProps = BoxAsChildProps &
  DropdownMenuContentOwnProps;

export type DropdownMenuItemOwnProps = {
  children?: unknown;
  disabled?: boolean;
  onSelect?: (event: PressEvent) => void;
};

export type DropdownMenuItemProps = Omit<
  ButtonLikeProps<'button', HTMLButtonElement>,
  'onPress'
> &
  DropdownMenuItemOwnProps;

export type DropdownMenuItemAsChildProps = Omit<
  ButtonLikeAsChildProps,
  'onPress'
> &
  DropdownMenuItemOwnProps;

export type DropdownMenuGroupProps = BoxProps<'div', HTMLDivElement>;
export type DropdownMenuGroupAsChildProps = BoxAsChildProps;

export type DropdownMenuLabelProps = BoxProps<'div', HTMLDivElement>;
export type DropdownMenuLabelAsChildProps = BoxAsChildProps;

export type DropdownMenuSeparatorProps = BoxProps<'div', HTMLDivElement>;
export type DropdownMenuSeparatorAsChildProps = BoxAsChildProps;
