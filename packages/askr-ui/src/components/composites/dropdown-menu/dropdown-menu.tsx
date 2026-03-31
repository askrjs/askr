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
import { DismissableLayer } from '../../composites/dismissable-layer';
import { FocusScope } from '../../composites/focus-scope';
import { focusSelectedCollectionItem } from '../../_internal/focus';
import { resolveCompoundId, resolvePartId } from '../../_internal/id';
import {
  collectItemMetadata,
  firstEnabledIndex,
  getMenuCollection,
  registerCollectionNode,
} from '../../_internal/menu';
import { mapJsxTree } from '../../_internal/jsx';
import {
  clearOverlayPosition,
  getOverlayNodes,
  getPersistentPortal,
  syncOverlayPosition,
} from '../../_internal/overlay';
import type {
  DropdownMenuContentAsChildProps,
  DropdownMenuContentProps,
  DropdownMenuGroupAsChildProps,
  DropdownMenuGroupProps,
  DropdownMenuItemAsChildProps,
  DropdownMenuItemProps,
  DropdownMenuLabelAsChildProps,
  DropdownMenuLabelProps,
  DropdownMenuPortalProps,
  DropdownMenuProps,
  DropdownMenuSeparatorAsChildProps,
  DropdownMenuSeparatorProps,
  DropdownMenuTriggerAsChildProps,
  DropdownMenuTriggerProps,
} from './dropdown-menu.types';

type InjectedDropdownMenuProps = {
  __dropdownMenuId?: string;
  __open?: boolean;
  __setOpen?: (open: boolean) => void;
  __contentId?: string;
  __portal?: ReturnType<typeof getPersistentPortal>;
  __currentIndex?: number;
  __setCurrentIndex?: (index: number) => void;
  __itemCount?: number;
  __disabledIndexes?: number[];
};

function readInjectedDropdownMenuProps(
  props: InjectedDropdownMenuProps
): Required<InjectedDropdownMenuProps> {
  if (
    !props.__dropdownMenuId ||
    props.__open === undefined ||
    !props.__setOpen ||
    !props.__contentId ||
    !props.__portal ||
    props.__currentIndex === undefined ||
    !props.__setCurrentIndex ||
    props.__itemCount === undefined ||
    !props.__disabledIndexes
  ) {
    throw new Error(
      'DropdownMenu components must be used within <DropdownMenu>'
    );
  }

  return {
    __dropdownMenuId: props.__dropdownMenuId,
    __open: props.__open,
    __setOpen: props.__setOpen,
    __contentId: props.__contentId,
    __portal: props.__portal,
    __currentIndex: props.__currentIndex,
    __setCurrentIndex: props.__setCurrentIndex,
    __itemCount: props.__itemCount,
    __disabledIndexes: props.__disabledIndexes,
  };
}

export function DropdownMenu(props: DropdownMenuProps) {
  const { children, id, open, defaultOpen = false, onOpenChange } = props;
  const openState = controllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const dropdownMenuId = resolveCompoundId('dropdown-menu', id, children);
  const items = collectItemMetadata(children, DropdownMenuItem);
  const currentIndexState = state(firstEnabledIndex(items));
  const currentIndex = items[currentIndexState()]
    ? currentIndexState()
    : firstEnabledIndex(items);
  const injectedProps: InjectedDropdownMenuProps = {
    __dropdownMenuId: dropdownMenuId,
    __open: openState(),
    __setOpen: openState.set,
    __contentId: resolvePartId(dropdownMenuId, 'content'),
    __portal: getPersistentPortal(dropdownMenuId),
    __currentIndex: currentIndex,
    __setCurrentIndex: currentIndexState.set,
    __itemCount: items.length,
    __disabledIndexes: items
      .map((item, index) => (item.disabled ? index : -1))
      .filter((index) => index !== -1),
  };
  let itemIndex = 0;
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (
      element.type !== DropdownMenuTrigger &&
      element.type !== DropdownMenuPortal &&
      element.type !== DropdownMenuContent &&
      element.type !== DropdownMenuItem
    ) {
      return element;
    }

    if (element.type === DropdownMenuItem) {
      const nextItemIndex = itemIndex;
      itemIndex += 1;
      return {
        ...element,
        props: {
          ...element.props,
          ...injectedProps,
          __itemIndex: nextItemIndex,
          __itemId: resolvePartId(dropdownMenuId, `item-${nextItemIndex}`),
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
  const PortalHost = injectedProps.__portal;

  return (
    <>
      {enhancedChildren}
      {PortalHost ? <PortalHost /> : null}
    </>
  );
}

export function DropdownMenuTrigger(
  props: DropdownMenuTriggerProps
): JSX.Element;
export function DropdownMenuTrigger(
  props: DropdownMenuTriggerAsChildProps
): JSX.Element;
export function DropdownMenuTrigger(
  props:
    | (DropdownMenuTriggerProps & InjectedDropdownMenuProps)
    | (DropdownMenuTriggerAsChildProps & InjectedDropdownMenuProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __dropdownMenuId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    ...rest
  } = props;
  const injected = readInjectedDropdownMenuProps({
    __dropdownMenuId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
  });
  const overlayNodes = getOverlayNodes(injected.__dropdownMenuId);
  const interactionProps = pressable({
    disabled,
    onPress: (event) => {
      onPress?.(event);
      if (!event.defaultPrevented) {
        injected.__setOpen(!injected.__open);
      }
    },
    isNativeButton: !asChild,
  });
  const finalProps = mergeProps(rest, {
    ...interactionProps,
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        overlayNodes.trigger = node;
      }
    ),
    'aria-haspopup': 'menu',
    'aria-expanded': injected.__open ? 'true' : 'false',
    'aria-controls': injected.__contentId,
    'data-slot': 'dropdown-menu-trigger',
    'data-disabled': disabled ? 'true' : undefined,
    'data-state': injected.__open ? 'open' : 'closed',
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

export function DropdownMenuPortal(
  props: DropdownMenuPortalProps & InjectedDropdownMenuProps
): JSX.Element | null {
  const injected = readInjectedDropdownMenuProps(props);

  return injected.__portal.render({
    children: props.children,
  }) as JSX.Element | null;
}

type DropdownMenuContentInjectedProps = InjectedDropdownMenuProps;

export function DropdownMenuContent(
  props: DropdownMenuContentProps
): JSX.Element | null;
export function DropdownMenuContent(
  props: DropdownMenuContentAsChildProps
): JSX.Element | null;
export function DropdownMenuContent(
  props:
    | (DropdownMenuContentProps & DropdownMenuContentInjectedProps)
    | (DropdownMenuContentAsChildProps & DropdownMenuContentInjectedProps)
) {
  const {
    asChild,
    children,
    forceMount = false,
    ref,
    side = 'bottom',
    align = 'start',
    sideOffset = 0,
    __dropdownMenuId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    ...rest
  } = props;
  const injected = readInjectedDropdownMenuProps({
    __dropdownMenuId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
  });
  const overlayNodes = getOverlayNodes(injected.__dropdownMenuId);
  const collection = getMenuCollection(injected.__dropdownMenuId);
  const nav = rovingFocus({
    currentIndex: injected.__currentIndex,
    itemCount: Math.max(injected.__itemCount, 1),
    orientation: 'vertical',
    loop: true,
    isDisabled: (index) => injected.__disabledIndexes.includes(index),
    onNavigate: (index) => {
      injected.__setCurrentIndex(index);
      focusSelectedCollectionItem(collection, index);
    },
  });
  const finalProps = mergeProps(rest, {
    ...nav.container,
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        overlayNodes.content = node;
        if (node && injected.__open) {
          syncOverlayPosition(injected.__dropdownMenuId, {
            side,
            align,
            sideOffset,
          });
        } else {
          clearOverlayPosition(injected.__dropdownMenuId);
        }

        if (node && injected.__open) {
          focusSelectedCollectionItem(collection, injected.__currentIndex);
        }
      }
    ),
    id: injected.__contentId,
    role: 'menu',
    'data-slot': 'dropdown-menu-content',
    'data-state': injected.__open ? 'open' : 'closed',
    'data-side': side,
    'data-align': align,
    'data-side-offset': String(sideOffset),
  });
  const contentNode = asChild ? (
    <Slot asChild {...finalProps} children={children} />
  ) : (
    <div {...finalProps}>{children}</div>
  );

  return (
    <Presence present={forceMount || injected.__open}>
      <FocusScope restoreFocus>
        <DismissableLayer
          onDismiss={() => {
            injected.__setOpen(false);
          }}
        >
          {contentNode}
        </DismissableLayer>
      </FocusScope>
    </Presence>
  );
}

type DropdownMenuItemInjectedProps = InjectedDropdownMenuProps & {
  __itemIndex?: number;
  __itemId?: string;
};

function readInjectedDropdownMenuItemProps(
  props: DropdownMenuItemInjectedProps
): Required<DropdownMenuItemInjectedProps> {
  const injected = readInjectedDropdownMenuProps(props);

  if (props.__itemIndex === undefined || !props.__itemId) {
    throw new Error('DropdownMenuItem must be used within <DropdownMenu>');
  }

  return {
    ...injected,
    __itemIndex: props.__itemIndex,
    __itemId: props.__itemId,
  };
}

export function DropdownMenuItem(props: DropdownMenuItemProps): JSX.Element;
export function DropdownMenuItem(
  props: DropdownMenuItemAsChildProps
): JSX.Element;
export function DropdownMenuItem(
  props:
    | (DropdownMenuItemProps & DropdownMenuItemInjectedProps)
    | (DropdownMenuItemAsChildProps & DropdownMenuItemInjectedProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onSelect,
    ref,
    type: typeProp,
    __dropdownMenuId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __itemIndex,
    __itemId,
    ...rest
  } = props;
  const injected = readInjectedDropdownMenuItemProps({
    __dropdownMenuId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __itemIndex,
    __itemId,
  });
  const collection = getMenuCollection(injected.__dropdownMenuId);
  const nav = rovingFocus({
    currentIndex: injected.__currentIndex,
    itemCount: Math.max(injected.__itemCount, 1),
    orientation: 'vertical',
    loop: true,
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
        injected.__setOpen(false);
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
    'data-slot': 'dropdown-menu-item',
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

export function DropdownMenuGroup(
  props: DropdownMenuGroupProps | DropdownMenuGroupAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    role: 'group',
    'data-slot': 'dropdown-menu-group',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function DropdownMenuLabel(
  props: DropdownMenuLabelProps | DropdownMenuLabelAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'dropdown-menu-label',
    'data-dropdown-menu-label': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function DropdownMenuSeparator(
  props: DropdownMenuSeparatorProps | DropdownMenuSeparatorAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    role: 'separator',
    'data-slot': 'dropdown-menu-separator',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
