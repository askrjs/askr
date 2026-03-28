import type { BoxAsChildProps, BoxProps } from '../../_internal/types';

export type ProgressOwnProps = {
  children?: unknown;
  id?: string;
  value?: number | null;
  max?: number;
  getValueLabel?: (value: number | null, max: number) => string;
};

export type ProgressProps = BoxProps<'div', HTMLDivElement> & ProgressOwnProps;

export type ProgressIndicatorProps = BoxProps<'div', HTMLDivElement>;
export type ProgressIndicatorAsChildProps = BoxAsChildProps;
