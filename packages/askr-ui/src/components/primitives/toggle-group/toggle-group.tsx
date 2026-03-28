import { state } from '@askrjs/askr';
import {
  Slot,
  composeRefs,
  controllableState,
  mergeProps,
  pressable,
  rovingFocus,
} from '@askrjs/askr/foundations';
import { focusSelectedCollectionItem } from '../../_internal/focus';
import {
  disabledIndexes,
  firstEnabledCompositeIndex,
  getCompositeCollection,
  registerCompositeNode,
} from '../../_internal/composite';
import {
  isDisclosureValueOpen,
  toggleDisclosureValue,
} from '../../_internal/disclosure';
import { resolveCompoundId, resolvePartId } from '../../_internal/id';
import { collectJsxElements, mapJsxTree } from '../../_internal/jsx';
import type {
  ToggleGroupMultipleProps,
  ToggleGroupProps,
  ToggleGroupSingleProps,
  ToggleGroupItemAsChildProps,
  ToggleGroupItemProps,
} from './toggle-group.types';

type InjectedToggleGroupProps = {
  __toggleGroupId?: string;
  __type?: 'single' | 'multiple';
  __value?: string | string[];
  __setValue?: (value: string | string[]) => void;
  __orientation?: 'horizontal' | 'vertical';
  __loop?: boolean;
  __disabled?: boolean;
  __currentIndex?: number;
  __setCurrentIndex?: (index: number) => void;
  __disabledIndexes?: number[];
  __itemCount?: number;
};

type InjectedToggleGroupItemProps = InjectedToggleGroupProps & {
  __itemValue?: string;
  __itemIndex?: number;
  __itemId?: string;
  __itemDisabled?: boolean;
};

function readInjectedToggleGroupProps(
  props: InjectedToggleGroupProps
): Required<InjectedToggleGroupProps> {
  if (
    !props.__toggleGroupId ||
    !props.__type ||
    props.__value === undefined ||
    !props.__setValue ||
    !props.__orientation ||
    props.__loop === undefined ||
    props.__disabled === undefined ||
    props.__currentIndex === undefined ||
    !props.__setCurrentIndex ||
    !props.__disabledIndexes ||
    props.__itemCount === undefined
  ) {
    throw new Error('ToggleGroup components must be used within <ToggleGroup>');
  }

  return {
    __toggleGroupId: props.__toggleGroupId,
    __type: props.__type,
    __value: props.__value,
    __setValue: props.__setValue,
    __orientation: props.__orientation,
    __loop: props.__loop,
    __disabled: props.__disabled,
    __currentIndex: props.__currentIndex,
    __setCurrentIndex: props.__setCurrentIndex,
    __disabledIndexes: props.__disabledIndexes,
    __itemCount: props.__itemCount,
  };
}

function readInjectedToggleGroupItemProps(
  props: InjectedToggleGroupItemProps
): Required<InjectedToggleGroupItemProps> {
  const injected = readInjectedToggleGroupProps(props);

  if (
    !props.__itemValue ||
    props.__itemIndex === undefined ||
    !props.__itemId ||
    props.__itemDisabled === undefined
  ) {
    throw new Error('ToggleGroupItem must be used within <ToggleGroup>');
  }

  return {
    ...injected,
    __itemValue: props.__itemValue,
    __itemIndex: props.__itemIndex,
    __itemId: props.__itemId,
    __itemDisabled: props.__itemDisabled,
  };
}

function createToggleGroupValueState(props: ToggleGroupProps) {
  if (props.type === 'multiple') {
    const multipleProps = props as ToggleGroupMultipleProps;
    return controllableState({
      value: multipleProps.value,
      defaultValue: multipleProps.defaultValue ?? [],
      onChange: multipleProps.onValueChange,
    });
  }

  const singleProps = props as ToggleGroupSingleProps;
  return controllableState({
    value: singleProps.value,
    defaultValue: singleProps.defaultValue ?? '',
    onChange: singleProps.onValueChange,
  });
}

export function ToggleGroup(props: ToggleGroupProps) {
  const {
    children,
    disabled = false,
    id,
    loop = true,
    orientation = 'horizontal',
    ref,
    type = 'single',
    ...rest
  } = props;
  const toggleGroupId = resolveCompoundId('toggle-group', id, children);
  const items = collectJsxElements(
    children,
    (element) => element.type === ToggleGroupItem
  ).map((element) => ({
    value: element.props?.value as string,
    disabled: disabled || Boolean(element.props?.disabled),
  }));
  const valueState = createToggleGroupValueState(props);
  const selectedIndex = items.findIndex((item) =>
    isDisclosureValueOpen(type, valueState(), item.value)
  );
  const currentIndexState = state(
    selectedIndex >= 0 ? selectedIndex : firstEnabledCompositeIndex(items)
  );
  const currentIndex = items[currentIndexState()]
    ? currentIndexState()
    : firstEnabledCompositeIndex(items);
  let itemIndex = 0;
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (element.type !== ToggleGroupItem) {
      return element;
    }

    const index = itemIndex;
    itemIndex += 1;
    const itemValue = element.props?.value as string;

    return {
      ...element,
      props: {
        ...element.props,
        __toggleGroupId: toggleGroupId,
        __type: type,
        __value: valueState(),
        __setValue: valueState.set,
        __orientation: orientation,
        __loop: loop,
        __disabled: disabled,
        __currentIndex: currentIndex,
        __setCurrentIndex: currentIndexState.set,
        __disabledIndexes: disabledIndexes(items),
        __itemCount: items.length,
        __itemValue: itemValue,
        __itemIndex: index,
        __itemId: resolvePartId(toggleGroupId, `item-${index}`),
        __itemDisabled: disabled || Boolean(element.props?.disabled),
      },
    };
  });
  const collection = getCompositeCollection(toggleGroupId);
  const nav = rovingFocus({
    currentIndex,
    itemCount: Math.max(items.length, 1),
    orientation,
    loop,
    isDisabled: (index) => disabledIndexes(items).includes(index),
    onNavigate: (index) => {
      currentIndexState.set(index);
      focusSelectedCollectionItem(collection, index);
    },
  });
  const finalProps = mergeProps(rest, {
    ...nav.container,
    ref,
    role: 'group',
    'data-slot': 'toggle-group',
    'data-orientation': orientation,
    'data-toggle-group': 'true',
    'data-disabled': disabled ? 'true' : undefined,
  });

  return <div {...finalProps}>{enhancedChildren}</div>;
}

export function ToggleGroupItem(props: ToggleGroupItemProps): JSX.Element;
export function ToggleGroupItem(
  props: ToggleGroupItemAsChildProps
): JSX.Element;
export function ToggleGroupItem(
  props:
    | (ToggleGroupItemProps & InjectedToggleGroupItemProps)
    | (ToggleGroupItemAsChildProps & InjectedToggleGroupItemProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __toggleGroupId,
    __type,
    __value,
    __setValue,
    __orientation,
    __loop,
    __disabled,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemId,
    __itemDisabled,
    ...rest
  } = props;
  const injected = readInjectedToggleGroupItemProps({
    __toggleGroupId,
    __type,
    __value,
    __setValue,
    __orientation,
    __loop,
    __disabled,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemId,
    __itemDisabled,
  });
  const collection = getCompositeCollection(injected.__toggleGroupId);
  const nav = rovingFocus({
    currentIndex: injected.__currentIndex,
    itemCount: Math.max(injected.__itemCount, 1),
    orientation: injected.__orientation,
    loop: injected.__loop,
    isDisabled: (index) => injected.__disabledIndexes.includes(index),
    onNavigate: (index) => {
      injected.__setCurrentIndex(index);
      focusSelectedCollectionItem(collection, index);
    },
  });
  const isDisabled = disabled || injected.__disabled || injected.__itemDisabled;
  const pressed = isDisclosureValueOpen(
    injected.__type,
    injected.__value,
    injected.__itemValue
  );
  const interactionProps = pressable({
    disabled: isDisabled,
    onPress: (event) => {
      onPress?.(event);

      if (!event.defaultPrevented) {
        injected.__setValue(
          toggleDisclosureValue(
            injected.__type,
            injected.__value,
            injected.__itemValue,
            true
          )
        );
        injected.__setCurrentIndex(injected.__itemIndex);
      }
    },
    isNativeButton: !asChild,
  });
  const finalProps = mergeProps(rest, {
    ...interactionProps,
    ...nav.item(injected.__itemIndex),
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        registerCompositeNode(injected.__itemId, collection, node, {
          index: injected.__itemIndex,
          disabled: isDisabled,
          value: injected.__itemValue,
        });
      }
    ),
    id: injected.__itemId,
    'aria-pressed': pressed ? 'true' : 'false',
    'data-slot': 'toggle-group-item',
    'data-state': pressed ? 'on' : 'off',
    'data-disabled': isDisabled ? 'true' : undefined,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return (
    <button type={typeProp ?? 'button'} {...finalProps}>
      {children}
    </button>
  );
}
