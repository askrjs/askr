import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxAsChildProps,
  BoxProps,
} from '../../_internal/types';
import type { OverlayAlign, OverlaySide } from '../../_internal/overlay';

export type NavigationMenuOwnProps = {
  children?: unknown;
  id?: string;
  loop?: boolean;
};

export type NavigationMenuProps = BoxProps<'nav', HTMLElement> &
  NavigationMenuOwnProps;

export type NavigationMenuListProps = BoxProps<'div', HTMLDivElement>;
export type NavigationMenuListAsChildProps = BoxAsChildProps;

export type NavigationMenuItemProps = {
  children?: unknown;
  value?: string;
};

export type NavigationMenuTriggerProps = ButtonLikeProps<
  'button',
  HTMLButtonElement
>;
export type NavigationMenuTriggerAsChildProps = ButtonLikeAsChildProps;

export type NavigationMenuContentOwnProps = {
  forceMount?: boolean;
  side?: OverlaySide;
  align?: OverlayAlign;
  sideOffset?: number;
};

export type NavigationMenuContentProps = BoxProps<'div', HTMLDivElement> &
  NavigationMenuContentOwnProps;
export type NavigationMenuContentAsChildProps = BoxAsChildProps &
  NavigationMenuContentOwnProps;

export type NavigationMenuLinkProps = BoxProps<'a', HTMLAnchorElement>;
export type NavigationMenuLinkAsChildProps = BoxAsChildProps;

export type NavigationMenuViewportProps = BoxProps<'div', HTMLDivElement>;
export type NavigationMenuViewportAsChildProps = BoxAsChildProps;

export type NavigationMenuIndicatorProps = BoxProps<'div', HTMLDivElement>;
export type NavigationMenuIndicatorAsChildProps = BoxAsChildProps;

export type NavigationMenuSubProps = {
  children?: unknown;
  value?: string;
};

export type NavigationMenuSubTriggerProps = ButtonLikeProps<
  'button',
  HTMLButtonElement
>;
export type NavigationMenuSubTriggerAsChildProps = ButtonLikeAsChildProps;

export type NavigationMenuSubContentProps = BoxProps<'div', HTMLDivElement> &
  NavigationMenuContentOwnProps;
export type NavigationMenuSubContentAsChildProps = BoxAsChildProps &
  NavigationMenuContentOwnProps;
