import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxAsChildProps,
  BoxProps,
} from '../_internal/types';
import type { OverlayAlign, OverlaySide } from '../_internal/overlay';

export type TooltipOwnProps = {
  children?: unknown;
  id?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export type TooltipProps = TooltipOwnProps;

export type TooltipTriggerProps = ButtonLikeProps<'button', HTMLButtonElement>;
export type TooltipTriggerAsChildProps = ButtonLikeAsChildProps;

export type TooltipPortalProps = {
  children?: unknown;
};

export type TooltipContentOwnProps = {
  forceMount?: boolean;
  side?: OverlaySide;
  align?: OverlayAlign;
  sideOffset?: number;
};

export type TooltipContentProps = BoxProps<'div', HTMLDivElement> &
  TooltipContentOwnProps;

export type TooltipContentAsChildProps = BoxAsChildProps &
  TooltipContentOwnProps;
