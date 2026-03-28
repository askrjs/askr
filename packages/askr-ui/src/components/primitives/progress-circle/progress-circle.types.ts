import type { BoxAsChildProps, BoxProps } from '../../_internal/types';

export type ProgressCircleOwnProps = {
  children?: unknown;
  id?: string;
  value?: number | null;
  max?: number;
  getValueLabel?: (value: number | null, max: number) => string;
};

export type ProgressCircleProps = BoxProps<'div', HTMLDivElement> &
  ProgressCircleOwnProps;

export type ProgressCircleIndicatorProps = BoxProps<'div', HTMLDivElement>;
export type ProgressCircleIndicatorAsChildProps = BoxAsChildProps;

export type SpinnerOwnProps = Omit<ProgressCircleOwnProps, 'value'> & {
  label?: string;
};

export type SpinnerProps = BoxProps<'div', HTMLDivElement> & SpinnerOwnProps;
