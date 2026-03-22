import {
  Slot,
  composeRefs,
  controllableState,
  mergeProps,
} from '@askrjs/askr/foundations';
import { mergeCssVar } from '../_internal/style';
import { resolveCompoundId, resolvePartId } from '../_internal/id';
import { mapJsxTree } from '../_internal/jsx';
import {
  rangePercentage,
  snapRangeValue,
  valueFromPointer,
} from '../_internal/range';
import type {
  SliderProps,
  SliderRangeAsChildProps,
  SliderRangeProps,
  SliderThumbAsChildProps,
  SliderThumbProps,
  SliderTrackAsChildProps,
  SliderTrackProps,
} from './slider.types';

type SliderEntry = {
  track: HTMLElement | null;
  thumb: HTMLElement | null;
  dragMove: ((event: PointerEvent) => void) | null;
  dragEnd: ((event: PointerEvent) => void) | null;
};

type InjectedSliderProps = {
  __sliderId?: string;
  __value?: number;
  __setValue?: (value: number) => void;
  __min?: number;
  __max?: number;
  __step?: number;
  __orientation?: 'horizontal' | 'vertical';
  __disabled?: boolean;
  __trackId?: string;
  __thumbId?: string;
};

const sliderEntries = new Map<string, SliderEntry>();

function getSliderEntry(sliderId: string) {
  const existing = sliderEntries.get(sliderId);

  if (existing) {
    return existing;
  }

  const created: SliderEntry = {
    track: null,
    thumb: null,
    dragMove: null,
    dragEnd: null,
  };
  sliderEntries.set(sliderId, created);
  return created;
}

function readInjectedSliderProps(
  props: InjectedSliderProps
): Required<InjectedSliderProps> {
  if (
    !props.__sliderId ||
    props.__value === undefined ||
    !props.__setValue ||
    props.__min === undefined ||
    props.__max === undefined ||
    props.__step === undefined ||
    !props.__orientation ||
    props.__disabled === undefined ||
    !props.__trackId ||
    !props.__thumbId
  ) {
    throw new Error('Slider parts must be used within <Slider>');
  }

  return {
    __sliderId: props.__sliderId,
    __value: props.__value,
    __setValue: props.__setValue,
    __min: props.__min,
    __max: props.__max,
    __step: props.__step,
    __orientation: props.__orientation,
    __disabled: props.__disabled,
    __trackId: props.__trackId,
    __thumbId: props.__thumbId,
  };
}

function normalizeSliderConfig(props: SliderProps) {
  const min = typeof props.min === 'number' ? props.min : 0;
  const max = typeof props.max === 'number' ? props.max : 100;
  const step =
    typeof props.step === 'number' && props.step > 0 ? props.step : 1;

  return {
    min,
    max: max > min ? max : min + step,
    step,
  };
}

function updateSliderValueFromPointer(
  event: PointerEvent,
  injected: Required<InjectedSliderProps>
) {
  const entry = getSliderEntry(injected.__sliderId);

  if (!entry.track) {
    return;
  }

  const nextValue = snapRangeValue(
    valueFromPointer(
      event,
      entry.track.getBoundingClientRect(),
      injected.__min,
      injected.__max,
      injected.__orientation
    ),
    injected.__min,
    injected.__max,
    injected.__step
  );

  injected.__setValue(nextValue);
  entry.thumb?.focus?.();
}

function beginSliderDrag(injected: Required<InjectedSliderProps>) {
  const entry = getSliderEntry(injected.__sliderId);

  if (entry.dragMove || entry.dragEnd) {
    return;
  }

  entry.dragMove = (event: PointerEvent) => {
    updateSliderValueFromPointer(event, injected);
  };
  entry.dragEnd = () => {
    if (entry.dragMove) {
      window.removeEventListener('pointermove', entry.dragMove);
    }

    if (entry.dragEnd) {
      window.removeEventListener('pointerup', entry.dragEnd);
    }

    entry.dragMove = null;
    entry.dragEnd = null;
  };
  window.addEventListener('pointermove', entry.dragMove);
  window.addEventListener('pointerup', entry.dragEnd);
}

export function Slider(props: SliderProps) {
  const {
    children,
    defaultValue,
    disabled = false,
    id,
    name,
    onValueChange,
    orientation = 'horizontal',
    ref,
    value,
    ...rest
  } = props;
  const { max, min, step } = normalizeSliderConfig(props);
  const sliderId = resolveCompoundId('slider', id, children);
  const valueState = controllableState({
    value,
    defaultValue: snapRangeValue(defaultValue ?? min, min, max, step),
    onChange: onValueChange,
  });
  const normalizedValue = snapRangeValue(valueState(), min, max, step);
  const percentage = rangePercentage(normalizedValue, min, max);
  const injectedProps: InjectedSliderProps = {
    __sliderId: sliderId,
    __value: normalizedValue,
    __setValue: valueState.set,
    __min: min,
    __max: max,
    __step: step,
    __orientation: orientation,
    __disabled: disabled,
    __trackId: resolvePartId(sliderId, 'track'),
    __thumbId: resolvePartId(sliderId, 'thumb'),
  };
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (
      element.type !== SliderTrack &&
      element.type !== SliderRange &&
      element.type !== SliderThumb
    ) {
      return element;
    }

    return {
      ...element,
      props: {
        ...element.props,
        ...injectedProps,
      },
    };
  });
  const finalProps = mergeProps(rest, {
    ref,
    style: mergeCssVar(
      (rest as { style?: unknown }).style,
      '--ak-slider-percentage',
      `${percentage}%`
    ),
    'data-slot': 'slider',
    'data-slider': 'true',
    'data-orientation': orientation,
    'data-disabled': disabled ? 'true' : undefined,
  });

  return (
    <div {...finalProps}>
      {enhancedChildren}
      {name ? (
        <input
          type="hidden"
          name={name}
          value={String(normalizedValue)}
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}

export function SliderTrack(props: SliderTrackProps): JSX.Element;
export function SliderTrack(props: SliderTrackAsChildProps): JSX.Element;
export function SliderTrack(
  props:
    | (SliderTrackProps & InjectedSliderProps)
    | (SliderTrackAsChildProps & InjectedSliderProps)
) {
  const {
    asChild,
    children,
    ref,
    __sliderId,
    __value,
    __setValue,
    __min,
    __max,
    __step,
    __orientation,
    __disabled,
    __trackId,
    __thumbId,
    ...rest
  } = props;
  const injected = readInjectedSliderProps({
    __sliderId,
    __value,
    __setValue,
    __min,
    __max,
    __step,
    __orientation,
    __disabled,
    __trackId,
    __thumbId,
  });
  const entry = getSliderEntry(injected.__sliderId);
  const percentage = rangePercentage(
    injected.__value,
    injected.__min,
    injected.__max
  );
  const finalProps = mergeProps(rest, {
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        entry.track = node;
      }
    ),
    id: injected.__trackId,
    'data-slot': 'slider-track',
    'data-slider-track': 'true',
    'data-orientation': injected.__orientation,
    'data-percentage': String(percentage),
    onPointerDown: (event: PointerEvent) => {
      if (injected.__disabled) {
        return;
      }

      updateSliderValueFromPointer(event, injected);
      beginSliderDrag(injected);
    },
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function SliderRange(props: SliderRangeProps): JSX.Element;
export function SliderRange(props: SliderRangeAsChildProps): JSX.Element;
export function SliderRange(
  props:
    | (SliderRangeProps & InjectedSliderProps)
    | (SliderRangeAsChildProps & InjectedSliderProps)
) {
  const {
    asChild,
    children,
    ref,
    __sliderId,
    __value,
    __setValue,
    __min,
    __max,
    __step,
    __orientation,
    __disabled,
    __trackId,
    __thumbId,
    ...rest
  } = props;
  const injected = readInjectedSliderProps({
    __sliderId,
    __value,
    __setValue,
    __min,
    __max,
    __step,
    __orientation,
    __disabled,
    __trackId,
    __thumbId,
  });
  const percentage = rangePercentage(
    injected.__value,
    injected.__min,
    injected.__max
  );
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'slider-range',
    'data-slider-range': 'true',
    'data-orientation': injected.__orientation,
    'data-percentage': String(percentage),
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function SliderThumb(props: SliderThumbProps): JSX.Element;
export function SliderThumb(props: SliderThumbAsChildProps): JSX.Element;
export function SliderThumb(
  props:
    | (SliderThumbProps & InjectedSliderProps)
    | (SliderThumbAsChildProps & InjectedSliderProps)
) {
  const {
    asChild,
    children,
    ref,
    __sliderId,
    __value,
    __setValue,
    __min,
    __max,
    __step,
    __orientation,
    __disabled,
    __trackId,
    __thumbId,
    ...rest
  } = props;
  const injected = readInjectedSliderProps({
    __sliderId,
    __value,
    __setValue,
    __min,
    __max,
    __step,
    __orientation,
    __disabled,
    __trackId,
    __thumbId,
  });
  const entry = getSliderEntry(injected.__sliderId);
  const percentage = rangePercentage(
    injected.__value,
    injected.__min,
    injected.__max
  );
  const finalProps = mergeProps(rest, {
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        entry.thumb = node;
      }
    ),
    id: injected.__thumbId,
    role: 'slider',
    tabIndex: injected.__disabled ? undefined : 0,
    'aria-valuemin': String(injected.__min),
    'aria-valuemax': String(injected.__max),
    'aria-valuenow': String(injected.__value),
    'aria-orientation': injected.__orientation,
    'aria-disabled': injected.__disabled ? 'true' : undefined,
    'data-slot': 'slider-thumb',
    'data-slider-thumb': 'true',
    'data-orientation': injected.__orientation,
    'data-percentage': String(percentage),
    onPointerDown: (event: PointerEvent) => {
      if (injected.__disabled) {
        return;
      }

      event.preventDefault();
      beginSliderDrag(injected);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (injected.__disabled) {
        return;
      }

      const nextValue =
        event.key === 'ArrowRight' || event.key === 'ArrowUp'
          ? injected.__value + injected.__step
          : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
            ? injected.__value - injected.__step
            : event.key === 'Home'
              ? injected.__min
              : event.key === 'End'
                ? injected.__max
                : event.key === 'PageUp'
                  ? injected.__value + injected.__step * 10
                  : event.key === 'PageDown'
                    ? injected.__value - injected.__step * 10
                    : null;

      if (nextValue === null) {
        return;
      }

      event.preventDefault();
      injected.__setValue(
        snapRangeValue(
          nextValue,
          injected.__min,
          injected.__max,
          injected.__step
        )
      );
    },
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
