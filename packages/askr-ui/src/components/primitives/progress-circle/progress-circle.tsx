import { Slot, mergeProps } from '@askrjs/askr/foundations';
import { mergeCssVar } from '../../_internal/style';
import { resolveCompoundId, resolvePartId } from '../../_internal/id';
import { mapJsxTree } from '../../_internal/jsx';
import {
  defaultProgressValueLabel,
  normalizeProgressMax,
  normalizeProgressValue,
  progressPercentage,
} from '../../_internal/progress';
import type {
  ProgressCircleIndicatorAsChildProps,
  ProgressCircleIndicatorProps,
  ProgressCircleProps,
  SpinnerProps,
} from './progress-circle.types';

type InjectedProgressCircleProps = {
  __progressCircleId?: string;
  __value?: number | null;
  __max?: number;
  __valueLabel?: string;
};

function readInjectedProgressCircleProps(
  props: InjectedProgressCircleProps
): Required<InjectedProgressCircleProps> {
  if (
    !props.__progressCircleId ||
    props.__max === undefined ||
    !props.__valueLabel
  ) {
    throw new Error(
      'ProgressCircleIndicator must be used within <ProgressCircle>'
    );
  }

  return {
    __progressCircleId: props.__progressCircleId,
    __value: props.__value ?? null,
    __max: props.__max,
    __valueLabel: props.__valueLabel,
  };
}

export function ProgressCircle(props: ProgressCircleProps) {
  const { children, getValueLabel, id, max, ref, value, ...rest } = props;
  const progressCircleId = resolveCompoundId('progress-circle', id, children);
  const normalizedMax = normalizeProgressMax(max);
  const normalizedValue = normalizeProgressValue(value, normalizedMax);
  const valueLabel =
    getValueLabel?.(normalizedValue, normalizedMax) ??
    defaultProgressValueLabel(normalizedValue, normalizedMax);
  const percentage = progressPercentage(normalizedValue, normalizedMax);
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (element.type !== ProgressCircleIndicator) {
      return element;
    }

    return {
      ...element,
      props: {
        ...element.props,
        __progressCircleId: progressCircleId,
        __value: normalizedValue,
        __max: normalizedMax,
        __valueLabel: valueLabel,
      },
    };
  });
  const finalProps = mergeProps(rest, {
    ref,
    id: progressCircleId,
    style: mergeCssVar(
      (rest as { style?: unknown }).style,
      '--ak-progress-percentage',
      percentage === null ? '25%' : `${percentage}%`
    ),
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': String(normalizedMax),
    'aria-valuenow':
      normalizedValue === null ? undefined : String(normalizedValue),
    'aria-valuetext': valueLabel,
    'data-slot': 'progress-circle',
    'data-progress-circle': 'true',
    'data-state': normalizedValue === null ? 'indeterminate' : 'determinate',
  });

  return <div {...finalProps}>{enhancedChildren}</div>;
}

export function ProgressCircleIndicator(
  props: ProgressCircleIndicatorProps
): JSX.Element;
export function ProgressCircleIndicator(
  props: ProgressCircleIndicatorAsChildProps
): JSX.Element;
export function ProgressCircleIndicator(
  props:
    | (ProgressCircleIndicatorProps & InjectedProgressCircleProps)
    | (ProgressCircleIndicatorAsChildProps & InjectedProgressCircleProps)
) {
  const {
    asChild,
    children,
    ref,
    __progressCircleId,
    __value,
    __max,
    __valueLabel,
    ...rest
  } = props;
  const injected = readInjectedProgressCircleProps({
    __progressCircleId,
    __value,
    __max,
    __valueLabel,
  });
  const percentage = progressPercentage(injected.__value, injected.__max);
  const finalProps = mergeProps(rest, {
    ref,
    id: resolvePartId(injected.__progressCircleId, 'indicator'),
    'data-slot': 'progress-circle-indicator',
    'data-progress-circle-indicator': 'true',
    'data-state': injected.__value === null ? 'indeterminate' : 'determinate',
    'data-value':
      injected.__value === null ? undefined : String(injected.__value),
    'data-max': String(injected.__max),
    'data-percentage': percentage === null ? undefined : String(percentage),
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function Spinner(props: SpinnerProps) {
  const {
    label,
    'aria-label': ariaLabel,
    ...rest
  } = props as SpinnerProps & { 'aria-label'?: string };

  return (
    <ProgressCircle
      {...rest}
      aria-label={ariaLabel ?? label ?? 'Loading'}
      value={null}
      getValueLabel={() => label ?? 'Loading'}
    />
  );
}
