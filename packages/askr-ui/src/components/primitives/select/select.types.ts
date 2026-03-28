import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxAsChildProps,
  BoxProps,
} from '../../_internal/types';
import type { OverlayAlign, OverlaySide } from '../../_internal/overlay';

export type SelectOwnProps = {
  children?: unknown;
  id?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  name?: string;
  disabled?: boolean;
};

export type SelectProps = SelectOwnProps;

export type SelectTriggerProps = ButtonLikeProps<'button', HTMLButtonElement>;
export type SelectTriggerAsChildProps = ButtonLikeAsChildProps;

export type SelectValueOwnProps = {
  placeholder?: string;
  children?: unknown;
};

export type SelectValueProps = BoxProps<'span', HTMLSpanElement> &
  SelectValueOwnProps;

export type SelectValueAsChildProps = BoxAsChildProps & SelectValueOwnProps;

export type SelectPortalProps = {
  children?: unknown;
};

export type SelectContentOwnProps = {
  forceMount?: boolean;
  side?: OverlaySide;
  align?: OverlayAlign;
  sideOffset?: number;
};

export type SelectContentProps = BoxProps<'div', HTMLDivElement> &
  SelectContentOwnProps;

export type SelectContentAsChildProps = BoxAsChildProps & SelectContentOwnProps;

export type SelectItemOwnProps = {
  children?: unknown;
  disabled?: boolean;
  value: string;
};

export type SelectItemProps = Omit<
  ButtonLikeProps<'button', HTMLButtonElement>,
  'onPress'
> &
  SelectItemOwnProps;

export type SelectItemAsChildProps = Omit<ButtonLikeAsChildProps, 'onPress'> &
  SelectItemOwnProps;

export type SelectItemTextProps = BoxProps<'span', HTMLSpanElement>;
export type SelectItemTextAsChildProps = BoxAsChildProps;

export type SelectGroupProps = BoxProps<'div', HTMLDivElement>;
export type SelectGroupAsChildProps = BoxAsChildProps;

export type SelectLabelProps = BoxProps<'div', HTMLDivElement>;
export type SelectLabelAsChildProps = BoxAsChildProps;

export type SelectSeparatorProps = BoxProps<'div', HTMLDivElement>;
export type SelectSeparatorAsChildProps = BoxAsChildProps;
