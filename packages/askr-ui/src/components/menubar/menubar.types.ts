import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxAsChildProps,
  BoxProps,
} from '../_internal/types';
import type { OverlayAlign, OverlaySide } from '../_internal/overlay';

export type MenubarOwnProps = {
  children?: unknown;
  id?: string;
  loop?: boolean;
};

export type MenubarProps = BoxProps<'div', HTMLDivElement> & MenubarOwnProps;

export type MenubarMenuProps = {
  children?: unknown;
  value?: string;
};

export type MenubarTriggerProps = ButtonLikeProps<'button', HTMLButtonElement>;
export type MenubarTriggerAsChildProps = ButtonLikeAsChildProps;

export type MenubarPortalProps = {
  children?: unknown;
};

export type MenubarContentOwnProps = {
  forceMount?: boolean;
  side?: OverlaySide;
  align?: OverlayAlign;
  sideOffset?: number;
};

export type MenubarContentProps = BoxProps<'div', HTMLDivElement> &
  MenubarContentOwnProps;
export type MenubarContentAsChildProps = BoxAsChildProps &
  MenubarContentOwnProps;

export type MenubarItemProps = ButtonLikeProps<'button', HTMLButtonElement>;
export type MenubarItemAsChildProps = ButtonLikeAsChildProps;

export type MenubarGroupProps = BoxProps<'div', HTMLDivElement>;
export type MenubarGroupAsChildProps = BoxAsChildProps;

export type MenubarLabelProps = BoxProps<'div', HTMLDivElement>;
export type MenubarLabelAsChildProps = BoxAsChildProps;

export type MenubarSeparatorProps = BoxProps<'div', HTMLDivElement>;
export type MenubarSeparatorAsChildProps = BoxAsChildProps;

export type MenubarSubProps = {
  children?: unknown;
  value?: string;
};

export type MenubarSubTriggerProps = ButtonLikeProps<
  'button',
  HTMLButtonElement
>;
export type MenubarSubTriggerAsChildProps = ButtonLikeAsChildProps;

export type MenubarSubContentProps = BoxProps<'div', HTMLDivElement> &
  MenubarContentOwnProps;
export type MenubarSubContentAsChildProps = BoxAsChildProps &
  MenubarContentOwnProps;
