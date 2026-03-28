import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxProps,
} from '../../_internal/types';

export type ToggleGroupOrientation = 'horizontal' | 'vertical';

type ToggleGroupSharedOwnProps = {
  children?: unknown;
  id?: string;
  orientation?: ToggleGroupOrientation;
  loop?: boolean;
  disabled?: boolean;
};

export type ToggleGroupSingleProps = BoxProps<'div', HTMLDivElement> &
  ToggleGroupSharedOwnProps & {
    type?: 'single';
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
  };

export type ToggleGroupMultipleProps = BoxProps<'div', HTMLDivElement> &
  ToggleGroupSharedOwnProps & {
    type: 'multiple';
    value?: string[];
    defaultValue?: string[];
    onValueChange?: (value: string[]) => void;
  };

export type ToggleGroupProps =
  | ToggleGroupSingleProps
  | ToggleGroupMultipleProps;

export type ToggleGroupItemOwnProps = {
  value: string;
  disabled?: boolean;
  children?: unknown;
};

export type ToggleGroupItemProps = ButtonLikeProps<
  'button',
  HTMLButtonElement
> &
  ToggleGroupItemOwnProps;
export type ToggleGroupItemAsChildProps = ButtonLikeAsChildProps &
  ToggleGroupItemOwnProps;
