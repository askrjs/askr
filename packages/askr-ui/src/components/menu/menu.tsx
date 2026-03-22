import { state } from '@askrjs/askr';
import {
  Slot,
  composeRefs,
  mergeProps,
  pressable,
  rovingFocus,
} from '@askrjs/askr/foundations';
import { focusSelectedCollectionItem } from '../_internal/focus';
import { resolveCompoundId, resolvePartId } from '../_internal/id';
import {
  collectItemMetadata,
  firstEnabledIndex,
  getMenuCollection,
  registerCollectionNode,
} from '../_internal/menu';
import { mapJsxTree } from '../_internal/jsx';
import type {
  MenuContentAsChildProps,
  MenuContentProps,
  MenuGroupAsChildProps,
  MenuGroupProps,
  MenuItemAsChildProps,
  MenuItemProps,
  MenuLabelAsChildProps,
  MenuLabelProps,
  MenuOwnProps,
  MenuProps,
  MenuSeparatorAsChildProps,
  MenuSeparatorProps,
} from './menu.types';

type InjectedMenuProps = {
  __menuId?: string;
  __orientation?: MenuOwnProps['orientation'];
  __loop?: boolean;
  __currentIndex?: number;
  __setCurrentIndex?: (index: number) => void;
  __itemCount?: number;
  __disabledIndexes?: number[];
};

function readInjectedMenuProps(
  props: InjectedMenuProps
): Required<InjectedMenuProps> {
  if (
    !props.__menuId ||
    !props.__orientation ||
    props.__loop === undefined ||
    props.__currentIndex === undefined ||
    !props.__setCurrentIndex ||
    props.__itemCount === undefined ||
    !props.__disabledIndexes
  ) {
    throw new Error('Menu components must be used within <Menu>');
  }

  return {
    __menuId: props.__menuId,
    __orientation: props.__orientation,
    __loop: props.__loop,
    __currentIndex: props.__currentIndex,
    __setCurrentIndex: props.__setCurrentIndex,
    __itemCount: props.__itemCount,
    __disabledIndexes: props.__disabledIndexes,
  };
}

export function Menu(props: MenuProps) {
  const { children, id, orientation = 'vertical', loop = true } = props;
  const menuId = resolveCompoundId('menu', id, children);
  const items = collectItemMetadata(children, MenuItem);
  const currentIndexState = state(firstEnabledIndex(items));
  const currentIndex = items[currentIndexState()]
    ? currentIndexState()
    : firstEnabledIndex(items);
  const injectedProps: InjectedMenuProps = {
    __menuId: menuId,
    __orientation: orientation,
    __loop: loop,
    __currentIndex: currentIndex,
    __setCurrentIndex: currentIndexState.set,
    __itemCount: items.length,
    __disabledIndexes: items
      .map((item, index) => (item.disabled ? index : -1))
      .filter((index) => index !== -1),
  };
  let itemIndex = 0;
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (element.type !== MenuContent && element.type !== MenuItem) {
      return element;
    }

    if (element.type === MenuItem) {
      const nextItemIndex = itemIndex;
      itemIndex += 1;
      return {
        ...element,
        props: {
          ...element.props,
          ...injectedProps,
          __itemIndex: nextItemIndex,
          __itemId: resolvePartId(menuId, `item-${nextItemIndex}`),
        },
      };
    }

    return {
      ...element,
      props: {
        ...element.props,
        ...injectedProps,
      },
    };
  });

  return <>{enhancedChildren}</>;
}

export function MenuContent(props: MenuContentProps): JSX.Element;
export function MenuContent(props: MenuContentAsChildProps): JSX.Element;
export function MenuContent(
  props: (MenuContentProps | MenuContentAsChildProps) & InjectedMenuProps
) {
  const {
    asChild,
    children,
    ref,
    __menuId,
    __orientation,
    __loop,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    ...rest
  } = props;
  const injected = readInjectedMenuProps({
    __menuId,
    __orientation,
    __loop,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
  });
  const collection = getMenuCollection(injected.__menuId);
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
    'data-slot': 'menu-content',
    'data-orientation': injected.__orientation,
    role: 'menu',
    'aria-orientation':
      injected.__orientation === 'both' ? undefined : injected.__orientation,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children as JSX.Element} />;
  }

  return <div {...finalProps}>{children}</div>;
}

type MenuItemInjectedProps = InjectedMenuProps & {
  __itemIndex?: number;
  __itemId?: string;
};

function readInjectedMenuItemProps(
  props: MenuItemInjectedProps
): Required<MenuItemInjectedProps> {
  const injected = readInjectedMenuProps(props);

  if (props.__itemIndex === undefined || !props.__itemId) {
    throw new Error('MenuItem must be used within <Menu>');
  }

  return {
    ...injected,
    __itemIndex: props.__itemIndex,
    __itemId: props.__itemId,
  };
}

export function MenuItem(props: MenuItemProps): JSX.Element;
export function MenuItem(props: MenuItemAsChildProps): JSX.Element;
export function MenuItem(
  props: (MenuItemProps | MenuItemAsChildProps) & MenuItemInjectedProps
) {
  const {
    asChild,
    children,
    disabled = false,
    onSelect,
    ref,
    type: typeProp,
    __menuId,
    __orientation,
    __loop,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __itemIndex,
    __itemId,
    ...rest
  } = props;
  const injected = readInjectedMenuItemProps({
    __menuId,
    __orientation,
    __loop,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __itemIndex,
    __itemId,
  });
  const collection = getMenuCollection(injected.__menuId);
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
  const interactionProps = pressable({
    disabled,
    onPress: (event) => {
      onSelect?.(event);
      if (!event.defaultPrevented) {
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
        registerCollectionNode(injected.__itemId, collection, node, {
          index: injected.__itemIndex,
          disabled,
        });
      }
    ),
    id: injected.__itemId,
    role: 'menuitem',
    'aria-disabled': disabled ? 'true' : undefined,
    'data-slot': 'menu-item',
    'data-disabled': disabled ? 'true' : undefined,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children as JSX.Element} />;
  }

  return (
    <button type={typeProp ?? 'button'} {...finalProps}>
      {children}
    </button>
  );
}

export function MenuGroup(props: MenuGroupProps): JSX.Element;
export function MenuGroup(props: MenuGroupAsChildProps): JSX.Element;
export function MenuGroup(props: MenuGroupProps | MenuGroupAsChildProps) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'menu-group',
    role: 'group',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function MenuLabel(props: MenuLabelProps): JSX.Element;
export function MenuLabel(props: MenuLabelAsChildProps): JSX.Element;
export function MenuLabel(props: MenuLabelProps | MenuLabelAsChildProps) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'menu-label',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function MenuSeparator(props: MenuSeparatorProps): JSX.Element;
export function MenuSeparator(props: MenuSeparatorAsChildProps): JSX.Element;
export function MenuSeparator(
  props: MenuSeparatorProps | MenuSeparatorAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'menu-separator',
    role: 'separator',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
