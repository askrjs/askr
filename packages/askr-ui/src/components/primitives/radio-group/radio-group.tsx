import {
  Slot,
  controllableState,
  mergeProps,
  pressable,
  rovingFocus,
} from '@askrjs/askr/foundations';
import type { JSXElement } from '@askrjs/askr/foundations';
import type {
  RadioGroupItemAsChildProps,
  RadioGroupItemProps,
  RadioGroupProps,
} from './radio-group.types';

type InjectedRadioGroupItemProps = {
  __groupValue?: string;
  __setGroupValue?: (value: string) => void;
  __groupDisabled?: boolean;
  __groupOrientation?: 'horizontal' | 'vertical' | 'both';
  __groupLoop?: boolean;
  __itemIndex?: number;
  __itemCount?: number;
  __itemValues?: string[];
};

function isJsxElement(value: unknown): value is JSXElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    'props' in value
  );
}

function toChildArray(children: unknown): unknown[] {
  if (Array.isArray(children)) {
    return children;
  }
  return children === undefined || children === null ? [] : [children];
}

function cloneRadioItemChild(
  child: unknown,
  injected: InjectedRadioGroupItemProps
): unknown {
  if (!isJsxElement(child) || child.type !== RadioGroupItem) {
    return child;
  }

  return {
    ...child,
    props: {
      ...child.props,
      ...injected,
    },
  };
}

export function RadioGroup(props: RadioGroupProps) {
  const {
    children,
    value,
    defaultValue = '',
    onValueChange,
    disabled = false,
    name,
    orientation = 'vertical',
    loop = true,
    ref,
    ...rest
  } = props;

  const valueState = controllableState({
    value,
    defaultValue,
    onChange: onValueChange,
  });
  const currentValue = valueState;
  const setValue = valueState.set;

  const childArray = toChildArray(children);
  const itemChildren = childArray.filter(
    (child): child is JSXElement =>
      isJsxElement(child) && child.type === RadioGroupItem
  );
  const itemValues = itemChildren.map((child) =>
    String(child.props.value ?? '')
  );
  const currentIndex = Math.max(0, itemValues.indexOf(currentValue()));
  const nav = rovingFocus({
    currentIndex,
    itemCount: Math.max(itemValues.length, 1),
    orientation,
    loop,
    onNavigate: (index) => {
      const next = itemValues[index];
      if (next) {
        setValue(next);
      }
    },
  });

  const enhancedChildren = childArray.map((child, index) =>
    cloneRadioItemChild(child, {
      __groupValue: currentValue(),
      __setGroupValue: setValue,
      __groupDisabled: disabled,
      __groupOrientation: orientation,
      __groupLoop: loop,
      __itemIndex: index,
      __itemCount: itemValues.length,
      __itemValues: itemValues,
    })
  );

  const finalProps = mergeProps(rest, {
    ...nav.container,
    ref,
    role: 'radiogroup',
    'data-slot': 'radio-group',
    'data-disabled': disabled ? 'true' : undefined,
    'data-orientation': orientation,
    'aria-orientation': orientation === 'both' ? undefined : orientation,
  });

  return (
    <div {...finalProps}>
      {enhancedChildren}
      {name ? (
        <input
          type="hidden"
          name={name}
          value={currentValue()}
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}

export function RadioGroupItem(props: RadioGroupItemProps): JSX.Element;
export function RadioGroupItem(props: RadioGroupItemAsChildProps): JSX.Element;
export function RadioGroupItem(
  props:
    | (RadioGroupItemProps & InjectedRadioGroupItemProps)
    | (RadioGroupItemAsChildProps & InjectedRadioGroupItemProps)
) {
  const {
    asChild,
    children,
    value,
    disabled = false,
    ref,
    __groupValue,
    __setGroupValue,
    __groupDisabled = false,
    __groupOrientation = 'vertical',
    __groupLoop = true,
    __itemIndex = 0,
    __itemCount = 1,
    __itemValues = [value],
    ...rest
  } = props;

  if (!__setGroupValue) {
    throw new Error('RadioGroupItem must be used within <RadioGroup>');
  }

  const checked = __groupValue === value;

  const nav = rovingFocus({
    currentIndex: Math.max(0, __itemValues.indexOf(__groupValue ?? '')),
    itemCount: Math.max(__itemCount, 1),
    orientation: __groupOrientation,
    loop: __groupLoop,
    onNavigate: (nextIndex) => {
      const next = __itemValues[nextIndex];
      if (next) {
        __setGroupValue(next);
      }
    },
  });

  const interactionProps = pressable({
    disabled: __groupDisabled || disabled,
    onPress: () => __setGroupValue(value),
    isNativeButton: !asChild,
  });

  const finalProps = mergeProps(rest, {
    ...interactionProps,
    ...nav.item(__itemIndex),
    ref,
    role: 'radio',
    'aria-checked': checked ? 'true' : 'false',
    'data-slot': 'radio-group-item',
    'data-disabled': __groupDisabled || disabled ? 'true' : undefined,
    'data-state': checked ? 'checked' : 'unchecked',
    value,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return (
    <button type="button" {...finalProps}>
      {children}
    </button>
  );
}
