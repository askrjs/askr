import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxAsChildProps,
  BoxProps,
} from '../../_internal/types';
import type { OverlayAlign, OverlaySide } from '../../_internal/overlay';

export type PopoverOwnProps = {
  children?: unknown;
  id?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export type PopoverProps = PopoverOwnProps;

export type PopoverTriggerProps = ButtonLikeProps<'button', HTMLButtonElement>;
export type PopoverTriggerAsChildProps = ButtonLikeAsChildProps;

export type PopoverPortalProps = {
  children?: unknown;
};

export type PopoverContentOwnProps = {
  forceMount?: boolean;
  side?: OverlaySide;
  align?: OverlayAlign;
  sideOffset?: number;
};

export type PopoverContentProps = BoxProps<'div', HTMLDivElement> &
  PopoverContentOwnProps;

export type PopoverContentAsChildProps = BoxAsChildProps &
  PopoverContentOwnProps;

export type PopoverCloseProps = ButtonLikeProps<'button', HTMLButtonElement>;
export type PopoverCloseAsChildProps = ButtonLikeAsChildProps;
