import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxAsChildProps,
  BoxProps,
} from '../_internal/types';

export type DialogOwnProps = {
  children?: unknown;
  id?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
};

export type DialogProps = DialogOwnProps;

export type DialogTriggerProps = ButtonLikeProps<'button', HTMLButtonElement>;
export type DialogTriggerAsChildProps = ButtonLikeAsChildProps;

export type DialogPortalProps = {
  children?: unknown;
};

export type DialogOverlayOwnProps = {
  forceMount?: boolean;
};

export type DialogOverlayProps = BoxProps<'div', HTMLDivElement> &
  DialogOverlayOwnProps;

export type DialogOverlayAsChildProps = BoxAsChildProps & DialogOverlayOwnProps;

export type DialogContentOwnProps = {
  forceMount?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: PointerEvent) => void;
  onInteractOutside?: (event: Event) => void;
  onDismiss?: () => void;
};

export type DialogContentProps = BoxProps<'div', HTMLDivElement> &
  DialogContentOwnProps;

export type DialogContentAsChildProps = BoxAsChildProps & DialogContentOwnProps;

export type DialogTitleProps = BoxProps<'h2', HTMLHeadingElement>;
export type DialogTitleAsChildProps = BoxAsChildProps;

export type DialogDescriptionProps = BoxProps<'p', HTMLParagraphElement>;
export type DialogDescriptionAsChildProps = BoxAsChildProps;

export type DialogCloseProps = ButtonLikeProps<'button', HTMLButtonElement>;
export type DialogCloseAsChildProps = ButtonLikeAsChildProps;
