import type { BoxAsChildProps, BoxProps } from '../_internal/types';

export type SliderOrientation = 'horizontal' | 'vertical';

export type SliderOwnProps = {
  children?: unknown;
  id?: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  orientation?: SliderOrientation;
  disabled?: boolean;
  name?: string;
};

export type SliderProps = BoxProps<'div', HTMLDivElement> & SliderOwnProps;

export type SliderTrackProps = BoxProps<'div', HTMLDivElement>;
export type SliderTrackAsChildProps = BoxAsChildProps;

export type SliderRangeProps = BoxProps<'div', HTMLDivElement>;
export type SliderRangeAsChildProps = BoxAsChildProps;

export type SliderThumbProps = BoxProps<'div', HTMLDivElement>;
export type SliderThumbAsChildProps = BoxAsChildProps;
