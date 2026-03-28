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
  ProgressIndicatorAsChildProps,
  ProgressIndicatorProps,
  ProgressProps,
} from './progress.types';

type InjectedProgressProps = {
  __progressId?: string;
  __value?: number | null;
  __max?: number;
  __valueLabel?: string;
};

function readInjectedProgressProps(
  props: InjectedProgressProps
): Required<InjectedProgressProps> {
  if (!props.__progressId || props.__max === undefined || !props.__valueLabel) {
    throw new Error('ProgressIndicator must be used within <Progress>');
  }

  return {
    __progressId: props.__progressId,
    __value: props.__value ?? null,
    __max: props.__max,
    __valueLabel: props.__valueLabel,
  };
}

export function Progress(props: ProgressProps) {
  const { children, getValueLabel, id, max, ref, value, ...rest } = props;
  const progressId = resolveCompoundId('progress', id, children);
  const normalizedMax = normalizeProgressMax(max);
  const normalizedValue = normalizeProgressValue(value, normalizedMax);
  const valueLabel =
    getValueLabel?.(normalizedValue, normalizedMax) ??
    defaultProgressValueLabel(normalizedValue, normalizedMax);
  const percentage = progressPercentage(normalizedValue, normalizedMax);
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (element.type !== ProgressIndicator) {
      return element;
    }

    return {
      ...element,
      props: {
        ...element.props,
        __progressId: progressId,
        __value: normalizedValue,
        __max: normalizedMax,
        __valueLabel: valueLabel,
      },
    };
  });
  const finalProps = mergeProps(rest, {
    ref,
    id: progressId,
    style: mergeCssVar(
      (rest as { style?: unknown }).style,
      '--ak-progress-percentage',
      percentage === null ? '100%' : `${percentage}%`
    ),
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': String(normalizedMax),
    'aria-valuenow':
      normalizedValue === null ? undefined : String(normalizedValue),
    'aria-valuetext': valueLabel,
    'data-slot': 'progress',
    'data-progress': 'true',
    'data-state': normalizedValue === null ? 'indeterminate' : 'determinate',
  });

  return <div {...finalProps}>{enhancedChildren}</div>;
}

export function ProgressIndicator(props: ProgressIndicatorProps): JSX.Element;
export function ProgressIndicator(
  props: ProgressIndicatorAsChildProps
): JSX.Element;
export function ProgressIndicator(
  props:
    | (ProgressIndicatorProps & InjectedProgressProps)
    | (ProgressIndicatorAsChildProps & InjectedProgressProps)
) {
  const {
    asChild,
    children,
    ref,
    __progressId,
    __value,
    __max,
    __valueLabel,
    ...rest
  } = props;
  const injected = readInjectedProgressProps({
    __progressId,
    __value,
    __max,
    __valueLabel,
  });
  const percentage = progressPercentage(injected.__value, injected.__max);
  const finalProps = mergeProps(rest, {
    ref,
    id: resolvePartId(injected.__progressId, 'indicator'),
    'data-slot': 'progress-indicator',
    'data-progress-indicator': 'true',
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
