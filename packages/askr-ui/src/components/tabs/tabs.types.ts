import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxAsChildProps,
  BoxProps,
} from '../_internal/types';

export type TabsOrientation = 'horizontal' | 'vertical';
export type TabsActivationMode = 'automatic' | 'manual';

export type TabsOwnProps = {
  children?: unknown;
  id?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: TabsOrientation;
  activationMode?: TabsActivationMode;
  loop?: boolean;
};

export type TabsProps = BoxProps<'div', HTMLDivElement> & TabsOwnProps;

export type TabsListProps = BoxProps<'div', HTMLDivElement>;
export type TabsListAsChildProps = BoxAsChildProps;

export type TabsTriggerOwnProps = {
  value: string;
  disabled?: boolean;
};

export type TabsTriggerProps = ButtonLikeProps<'button', HTMLButtonElement> &
  TabsTriggerOwnProps;
export type TabsTriggerAsChildProps = ButtonLikeAsChildProps &
  TabsTriggerOwnProps;

export type TabsContentOwnProps = {
  value: string;
  forceMount?: boolean;
};

export type TabsContentProps = BoxProps<'div', HTMLDivElement> &
  TabsContentOwnProps;
export type TabsContentAsChildProps = BoxAsChildProps & TabsContentOwnProps;
