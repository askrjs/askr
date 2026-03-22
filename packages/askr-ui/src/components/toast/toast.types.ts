import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxAsChildProps,
  BoxProps,
} from '../_internal/types';

export type ToastProviderOwnProps = {
  children?: unknown;
  id?: string;
  duration?: number;
};

export type ToastProviderProps = BoxProps<'div', HTMLDivElement> &
  ToastProviderOwnProps;

export type ToastViewportProps = BoxProps<'div', HTMLDivElement>;
export type ToastViewportAsChildProps = BoxAsChildProps;

export type ToastOwnProps = {
  children?: unknown;
  id?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

export type ToastProps = BoxProps<'div', HTMLDivElement> & ToastOwnProps;

export type ToastTitleProps = BoxProps<'div', HTMLDivElement>;
export type ToastTitleAsChildProps = BoxAsChildProps;

export type ToastDescriptionProps = BoxProps<'div', HTMLDivElement>;
export type ToastDescriptionAsChildProps = BoxAsChildProps;

export type ToastActionProps = ButtonLikeProps<'button', HTMLButtonElement>;
export type ToastActionAsChildProps = ButtonLikeAsChildProps;

export type ToastCloseProps = ButtonLikeProps<'button', HTMLButtonElement>;
export type ToastCloseAsChildProps = ButtonLikeAsChildProps;
