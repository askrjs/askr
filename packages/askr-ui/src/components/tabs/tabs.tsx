import { state } from '@askrjs/askr';
import {
  Presence,
  Slot,
  composeRefs,
  controllableState,
  mergeProps,
  pressable,
  rovingFocus,
} from '@askrjs/askr/foundations';
import { focusSelectedCollectionItem } from '../_internal/focus';
import {
  disabledIndexes,
  firstEnabledCompositeIndex,
  getCompositeCollection,
  registerCompositeNode,
} from '../_internal/composite';
import { resolveCompoundId, resolvePartId } from '../_internal/id';
import { collectJsxElements, mapJsxTree } from '../_internal/jsx';
import type {
  TabsContentAsChildProps,
  TabsContentProps,
  TabsListAsChildProps,
  TabsListProps,
  TabsProps,
  TabsTriggerAsChildProps,
  TabsTriggerProps,
} from './tabs.types';

type InjectedTabsProps = {
  __tabsId?: string;
  __value?: string;
  __setValue?: (value: string) => void;
  __orientation?: 'horizontal' | 'vertical';
  __activationMode?: 'automatic' | 'manual';
  __loop?: boolean;
  __currentIndex?: number;
  __setCurrentIndex?: (index: number) => void;
  __disabledIndexes?: number[];
  __itemCount?: number;
};

type InjectedTabsTriggerProps = InjectedTabsProps & {
  __itemValue?: string;
  __itemIndex?: number;
  __itemDisabled?: boolean;
  __triggerId?: string;
  __contentId?: string;
};

function readInjectedTabsProps(
  props: InjectedTabsProps
): Required<InjectedTabsProps> {
  if (
    !props.__tabsId ||
    props.__value === undefined ||
    !props.__setValue ||
    !props.__orientation ||
    !props.__activationMode ||
    props.__loop === undefined ||
    props.__currentIndex === undefined ||
    !props.__setCurrentIndex ||
    !props.__disabledIndexes ||
    props.__itemCount === undefined
  ) {
    throw new Error('Tabs components must be used within <Tabs>');
  }

  return {
    __tabsId: props.__tabsId,
    __value: props.__value,
    __setValue: props.__setValue,
    __orientation: props.__orientation,
    __activationMode: props.__activationMode,
    __loop: props.__loop,
    __currentIndex: props.__currentIndex,
    __setCurrentIndex: props.__setCurrentIndex,
    __disabledIndexes: props.__disabledIndexes,
    __itemCount: props.__itemCount,
  };
}

function readInjectedTabsTriggerProps(
  props: InjectedTabsTriggerProps
): Required<InjectedTabsTriggerProps> {
  const injected = readInjectedTabsProps(props);

  if (
    !props.__itemValue ||
    props.__itemIndex === undefined ||
    props.__itemDisabled === undefined ||
    !props.__triggerId ||
    !props.__contentId
  ) {
    throw new Error('TabsTrigger and TabsContent must be used within <Tabs>');
  }

  return {
    ...injected,
    __itemValue: props.__itemValue,
    __itemIndex: props.__itemIndex,
    __itemDisabled: props.__itemDisabled,
    __triggerId: props.__triggerId,
    __contentId: props.__contentId,
  };
}

export function Tabs(props: TabsProps) {
  const {
    children,
    id,
    defaultValue,
    onValueChange,
    orientation = 'horizontal',
    activationMode = 'automatic',
    loop = true,
    value,
    ref,
    ...rest
  } = props;
  const tabsId = resolveCompoundId('tabs', id, children);
  const triggers = collectJsxElements(
    children,
    (element) => element.type === TabsTrigger
  ).map((element) => ({
    value: element.props?.value as string,
    disabled: Boolean(element.props?.disabled),
  }));
  const valueState = controllableState({
    value,
    defaultValue:
      defaultValue ??
      triggers[firstEnabledCompositeIndex(triggers)]?.value ??
      '',
    onChange: onValueChange,
  });
  const selectedIndex = triggers.findIndex(
    (item) => item.value === valueState()
  );
  const currentIndexState = state(
    selectedIndex >= 0 ? selectedIndex : firstEnabledCompositeIndex(triggers)
  );
  const currentIndex = triggers[currentIndexState()]
    ? currentIndexState()
    : firstEnabledCompositeIndex(triggers);
  let triggerIndex = 0;
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (
      element.type !== TabsList &&
      element.type !== TabsTrigger &&
      element.type !== TabsContent
    ) {
      return element;
    }

    if (element.type === TabsTrigger || element.type === TabsContent) {
      const itemValue = element.props?.value as string;
      const itemIndex =
        element.type === TabsTrigger
          ? triggerIndex++
          : triggers.findIndex((entry) => entry.value === itemValue);
      const triggerId = resolvePartId(tabsId, `trigger-${itemValue}`);
      const contentId = resolvePartId(tabsId, `content-${itemValue}`);

      return {
        ...element,
        props: {
          ...element.props,
          __tabsId: tabsId,
          __value: valueState(),
          __setValue: valueState.set,
          __orientation: orientation,
          __activationMode: activationMode,
          __loop: loop,
          __currentIndex: currentIndex,
          __setCurrentIndex: currentIndexState.set,
          __disabledIndexes: disabledIndexes(triggers),
          __itemCount: triggers.length,
          __itemValue: itemValue,
          __itemIndex: itemIndex,
          __itemDisabled:
            element.type === TabsTrigger
              ? Boolean(element.props?.disabled)
              : false,
          __triggerId: triggerId,
          __contentId: contentId,
        },
      };
    }

    return {
      ...element,
      props: {
        ...element.props,
        __tabsId: tabsId,
        __value: valueState(),
        __setValue: valueState.set,
        __orientation: orientation,
        __activationMode: activationMode,
        __loop: loop,
        __currentIndex: currentIndex,
        __setCurrentIndex: currentIndexState.set,
        __disabledIndexes: disabledIndexes(triggers),
        __itemCount: triggers.length,
      },
    };
  });
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'tabs',
    'data-tabs': 'true',
    'data-orientation': orientation,
  });

  return <div {...finalProps}>{enhancedChildren}</div>;
}

export function TabsList(props: TabsListProps): JSX.Element;
export function TabsList(props: TabsListAsChildProps): JSX.Element;
export function TabsList(
  props: (TabsListProps | TabsListAsChildProps) & InjectedTabsProps
) {
  const {
    asChild,
    children,
    ref,
    __tabsId,
    __value,
    __setValue,
    __orientation,
    __activationMode,
    __loop,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    ...rest
  } = props;
  const injected = readInjectedTabsProps({
    __tabsId,
    __value,
    __setValue,
    __orientation,
    __activationMode,
    __loop,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
  });
  const collection = getCompositeCollection(injected.__tabsId);
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
  const finalProps = mergeProps(rest, {
    ...nav.container,
    ref,
    role: 'tablist',
    'aria-orientation': injected.__orientation,
    'data-slot': 'tabs-list',
    'data-orientation': injected.__orientation,
    'data-tabs-list': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function TabsTrigger(props: TabsTriggerProps): JSX.Element;
export function TabsTrigger(props: TabsTriggerAsChildProps): JSX.Element;
export function TabsTrigger(
  props:
    | (TabsTriggerProps & InjectedTabsTriggerProps)
    | (TabsTriggerAsChildProps & InjectedTabsTriggerProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __tabsId,
    __value,
    __setValue,
    __orientation,
    __activationMode,
    __loop,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __triggerId,
    __contentId,
    ...rest
  } = props;
  const injected = readInjectedTabsTriggerProps({
    __tabsId,
    __value,
    __setValue,
    __orientation,
    __activationMode,
    __loop,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __triggerId,
    __contentId,
  });
  const collection = getCompositeCollection(injected.__tabsId);
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
  const selected = injected.__value === injected.__itemValue;
  const isDisabled = disabled || injected.__itemDisabled;
  const interactionProps = pressable({
    disabled: isDisabled,
    onPress: (event) => {
      onPress?.(event);

      if (!event.defaultPrevented) {
        injected.__setValue(injected.__itemValue);
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
        registerCompositeNode(injected.__triggerId, collection, node, {
          index: injected.__itemIndex,
          disabled: isDisabled,
          value: injected.__itemValue,
        });
      }
    ),
    id: injected.__triggerId,
    role: 'tab',
    'aria-selected': selected ? 'true' : 'false',
    'aria-controls': injected.__contentId,
    'data-slot': 'tabs-trigger',
    'data-state': selected ? 'active' : 'inactive',
    'data-disabled': isDisabled ? 'true' : undefined,
    onFocus: () => {
      injected.__setCurrentIndex(injected.__itemIndex);

      if (injected.__activationMode === 'automatic' && !isDisabled) {
        injected.__setValue(injected.__itemValue);
      }
    },
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

export function TabsContent(props: TabsContentProps): JSX.Element | null;
export function TabsContent(props: TabsContentAsChildProps): JSX.Element | null;
export function TabsContent(
  props:
    | (TabsContentProps & InjectedTabsTriggerProps)
    | (TabsContentAsChildProps & InjectedTabsTriggerProps)
) {
  const {
    asChild,
    children,
    forceMount = false,
    ref,
    __tabsId,
    __value,
    __setValue,
    __orientation,
    __activationMode,
    __loop,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __triggerId,
    __contentId,
    ...rest
  } = props;
  const injected = readInjectedTabsTriggerProps({
    __tabsId,
    __value,
    __setValue,
    __orientation,
    __activationMode,
    __loop,
    __currentIndex,
    __setCurrentIndex,
    __disabledIndexes,
    __itemCount,
    __itemValue,
    __itemIndex,
    __itemDisabled,
    __triggerId,
    __contentId,
  });
  const selected = injected.__value === injected.__itemValue;
  const finalProps = mergeProps(rest, {
    ref,
    id: injected.__contentId,
    role: 'tabpanel',
    'aria-labelledby': injected.__triggerId,
    'data-slot': 'tabs-content',
    'data-state': selected ? 'active' : 'inactive',
  });

  return (
    <Presence present={forceMount || selected}>
      {asChild ? (
        <Slot asChild {...finalProps} children={children} />
      ) : (
        <div {...finalProps}>{children}</div>
      )}
    </Presence>
  );
}
