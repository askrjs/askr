import { state } from '@askrjs/askr';
import {
  Presence,
  Slot,
  composeRefs,
  mergeProps,
  pressable,
  rovingFocus,
} from '@askrjs/askr/foundations';
import { DismissableLayer } from '../../composites/dismissable-layer';
import { FocusScope } from '../../composites/focus-scope';
import { focusSelectedCollectionItem } from '../../_internal/focus';
import {
  disabledIndexes,
  firstEnabledCompositeIndex,
  getCompositeCollection,
  registerCompositeNode,
} from '../../_internal/composite';
import {
  collectSurfaceElements,
  mapSurfaceChildren,
  pathIsOpen,
  samePath,
} from '../../_internal/hierarchical-menu';
import { resolveCompoundId, resolvePartId } from '../../_internal/id';
import { collectJsxElements, mapJsxTree } from '../../_internal/jsx';
import {
  clearOverlayPosition,
  getOverlayNodes,
  getPersistentPortal,
  syncOverlayPosition,
} from '../../_internal/overlay';
import { stripInternalProps } from '../../_internal/props';
import type {
  MenubarContentAsChildProps,
  MenubarContentProps,
  MenubarGroupAsChildProps,
  MenubarGroupProps,
  MenubarItemAsChildProps,
  MenubarItemProps,
  MenubarLabelAsChildProps,
  MenubarLabelProps,
  MenubarMenuProps,
  MenubarPortalProps,
  MenubarProps,
  MenubarSeparatorAsChildProps,
  MenubarSeparatorProps,
  MenubarSubContentAsChildProps,
  MenubarSubContentProps,
  MenubarSubProps,
  MenubarSubTriggerAsChildProps,
  MenubarSubTriggerProps,
  MenubarTriggerAsChildProps,
  MenubarTriggerProps,
} from './menubar.types';

type MenubarRootInjectedProps = {
  __menubarId?: string;
  __openPath?: string[];
  __setOpenPath?: (path: string[]) => void;
  __loop?: boolean;
  __currentTriggerIndex?: number;
  __setCurrentTriggerIndex?: (index: number) => void;
  __triggerCount?: number;
  __disabledTriggerIndexes?: number[];
  __portal?: ReturnType<typeof getPersistentPortal>;
};

type MenubarMenuInjectedProps = MenubarRootInjectedProps & {
  __menuKey?: string;
  __menuIndex?: number;
  __triggerId?: string;
  __contentId?: string;
};

type MenubarContentInjectedProps = MenubarMenuInjectedProps & {
  __path?: string[];
  __contentCurrentIndex?: number;
  __setContentCurrentIndex?: (index: number) => void;
  __contentItemCount?: number;
  __contentDisabledIndexes?: number[];
};

type MenubarSurfaceInjectedProps = MenubarContentInjectedProps & {
  __surfaceIndex?: number;
  __surfaceId?: string;
  __surfaceDisabled?: boolean;
  __subKey?: string;
  __subPath?: string[];
};

function readMenubarRootInjectedProps(
  props: MenubarRootInjectedProps
): Required<MenubarRootInjectedProps> {
  if (
    !props.__menubarId ||
    !props.__openPath ||
    !props.__setOpenPath ||
    props.__loop === undefined ||
    props.__currentTriggerIndex === undefined ||
    !props.__setCurrentTriggerIndex ||
    props.__triggerCount === undefined ||
    !props.__disabledTriggerIndexes ||
    !props.__portal
  ) {
    throw new Error('Menubar components must be used within <Menubar>');
  }

  return {
    __menubarId: props.__menubarId,
    __openPath: props.__openPath,
    __setOpenPath: props.__setOpenPath,
    __loop: props.__loop,
    __currentTriggerIndex: props.__currentTriggerIndex,
    __setCurrentTriggerIndex: props.__setCurrentTriggerIndex,
    __triggerCount: props.__triggerCount,
    __disabledTriggerIndexes: props.__disabledTriggerIndexes,
    __portal: props.__portal,
  };
}

function readMenubarMenuInjectedProps(
  props: MenubarMenuInjectedProps
): Required<MenubarMenuInjectedProps> {
  const injected = readMenubarRootInjectedProps(props);

  if (
    !props.__menuKey ||
    props.__menuIndex === undefined ||
    !props.__triggerId ||
    !props.__contentId
  ) {
    throw new Error('MenubarMenu must be used within <Menubar>');
  }

  return {
    ...injected,
    __menuKey: props.__menuKey,
    __menuIndex: props.__menuIndex,
    __triggerId: props.__triggerId,
    __contentId: props.__contentId,
  };
}

function readMenubarContentInjectedProps(
  props: MenubarContentInjectedProps
): Required<MenubarContentInjectedProps> {
  const injected = readMenubarMenuInjectedProps(props);

  if (
    !props.__path ||
    props.__contentCurrentIndex === undefined ||
    !props.__setContentCurrentIndex ||
    props.__contentItemCount === undefined ||
    !props.__contentDisabledIndexes
  ) {
    throw new Error('Menubar content must be used within <MenubarMenu>');
  }

  return {
    ...injected,
    __path: props.__path,
    __contentCurrentIndex: props.__contentCurrentIndex,
    __setContentCurrentIndex: props.__setContentCurrentIndex,
    __contentItemCount: props.__contentItemCount,
    __contentDisabledIndexes: props.__contentDisabledIndexes,
  };
}

function readMenubarSurfaceInjectedProps(
  props: MenubarSurfaceInjectedProps
): Required<MenubarSurfaceInjectedProps> {
  const injected = readMenubarContentInjectedProps(props);

  if (
    props.__surfaceIndex === undefined ||
    !props.__surfaceId ||
    props.__surfaceDisabled === undefined
  ) {
    throw new Error('Menubar items must be used within <MenubarContent>');
  }

  return {
    ...injected,
    __surfaceIndex: props.__surfaceIndex,
    __surfaceId: props.__surfaceId,
    __surfaceDisabled: props.__surfaceDisabled,
    __subKey: props.__subKey ?? '',
    __subPath: props.__subPath ?? injected.__path,
  };
}

function collectContentItems(children: unknown) {
  return collectSurfaceElements(
    children,
    (element) => element.type === MenubarItem || element.type === MenubarSub,
    (element) => element.type === MenubarSubContent
  ).map((element) => ({
    disabled:
      element.type === MenubarItem
        ? Boolean(element.props?.disabled)
        : Boolean(
            collectJsxElements(
              element.props?.children,
              (child) => child.type === MenubarSubTrigger
            )[0]?.props?.disabled
          ),
  }));
}

export function Menubar(props: MenubarProps) {
  const { children, id, loop = true, ref, ...rest } = props;
  const menubarId = resolveCompoundId('menubar', id, children);
  const openPathState = state<string[]>([]);
  const triggers = collectJsxElements(
    children,
    (element) => element.type === MenubarTrigger
  ).map((element) => ({
    disabled: Boolean(element.props?.disabled),
  }));
  const currentTriggerIndexState = state(firstEnabledCompositeIndex(triggers));
  const currentTriggerIndex = triggers[currentTriggerIndexState()]
    ? currentTriggerIndexState()
    : firstEnabledCompositeIndex(triggers);
  let menuIndex = 0;
  const nav = rovingFocus({
    currentIndex: currentTriggerIndex,
    itemCount: Math.max(triggers.length, 1),
    orientation: 'horizontal',
    loop,
    isDisabled: (index) => disabledIndexes(triggers).includes(index),
    onNavigate: (index) => {
      currentTriggerIndexState.set(index);
      focusSelectedCollectionItem(getCompositeCollection(menubarId), index);
    },
  });
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (element.type !== MenubarMenu) {
      return element;
    }

    const index = menuIndex;
    menuIndex += 1;
    const menuKey = element.props?.value ?? `menu-${index}`;

    return {
      ...element,
      props: {
        ...element.props,
        __menubarId: menubarId,
        __openPath: openPathState(),
        __setOpenPath: openPathState.set,
        __loop: loop,
        __currentTriggerIndex: currentTriggerIndex,
        __setCurrentTriggerIndex: currentTriggerIndexState.set,
        __triggerCount: triggers.length,
        __disabledTriggerIndexes: disabledIndexes(triggers),
        __portal: getPersistentPortal(
          resolvePartId(menubarId, `portal-${index}`)
        ),
        __menuKey: menuKey,
        __menuIndex: index,
        __triggerId: resolvePartId(menubarId, `trigger-${index}`),
        __contentId: resolvePartId(menubarId, `content-${index}`),
      },
    };
  });
  const finalProps = mergeProps(stripInternalProps(rest), {
    ...nav.container,
    ref,
    role: 'menubar',
    'data-slot': 'menubar',
    'data-menubar': 'true',
  });

  return <div {...finalProps}>{enhancedChildren}</div>;
}

export function MenubarMenu(
  props: MenubarMenuProps & MenubarMenuInjectedProps
) {
  const injected = readMenubarMenuInjectedProps(props);
  const path = [injected.__menuKey];
  const enhancedChildren = mapJsxTree(props.children, (element) => {
    if (
      element.type !== MenubarTrigger &&
      element.type !== MenubarPortal &&
      element.type !== MenubarContent
    ) {
      return element;
    }

    return {
      ...element,
      props: {
        ...element.props,
        ...injected,
        __path: path,
      },
    };
  });

  return <>{enhancedChildren}</>;
}

export function MenubarTrigger(props: MenubarTriggerProps): JSX.Element;
export function MenubarTrigger(props: MenubarTriggerAsChildProps): JSX.Element;
export function MenubarTrigger(
  props:
    | (MenubarTriggerProps & MenubarMenuInjectedProps)
    | (MenubarTriggerAsChildProps & MenubarMenuInjectedProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __menubarId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __menuKey,
    __menuIndex,
    __triggerId,
    __contentId,
    ...rest
  } = props;
  const injected = readMenubarMenuInjectedProps({
    __menubarId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __menuKey,
    __menuIndex,
    __triggerId,
    __contentId,
  });
  const collection = getCompositeCollection(injected.__menubarId);
  const nav = rovingFocus({
    currentIndex: injected.__currentTriggerIndex,
    itemCount: Math.max(injected.__triggerCount, 1),
    orientation: 'horizontal',
    loop: injected.__loop,
    isDisabled: (index) => injected.__disabledTriggerIndexes.includes(index),
    onNavigate: (index) => {
      injected.__setCurrentTriggerIndex(index);
      focusSelectedCollectionItem(collection, index);
    },
  });
  const open = samePath(injected.__openPath, [injected.__menuKey]);
  const interactionProps = pressable({
    disabled,
    onPress: (event) => {
      onPress?.(event);

      if (!event.defaultPrevented) {
        injected.__setOpenPath(open ? [] : [injected.__menuKey]);
      }
    },
    isNativeButton: !asChild,
  });
  const finalProps = mergeProps(stripInternalProps(rest), {
    ...interactionProps,
    ...nav.item(injected.__menuIndex),
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        getOverlayNodes(injected.__triggerId).trigger = node;
        registerCompositeNode(injected.__triggerId, collection, node, {
          index: injected.__menuIndex,
          disabled,
          value: injected.__menuKey,
        });
      }
    ),
    id: injected.__triggerId,
    role: 'menuitem',
    'aria-haspopup': 'menu',
    'aria-expanded': open ? 'true' : 'false',
    'aria-controls': injected.__contentId,
    'data-slot': 'menubar-trigger',
    'data-disabled': disabled ? 'true' : undefined,
    'data-state': open ? 'open' : 'closed',
    onFocus: () => {
      injected.__setCurrentTriggerIndex(injected.__menuIndex);
    },
    onPointerEnter: () => {
      if (injected.__openPath.length > 0) {
        injected.__setOpenPath([injected.__menuKey]);
      }
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        injected.__setOpenPath([injected.__menuKey]);
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

export function MenubarPortal(
  props: MenubarPortalProps & MenubarMenuInjectedProps
): JSX.Element | null {
  readMenubarMenuInjectedProps(props);

  return <>{props.children}</>;
}

function enhanceMenubarContentChildren(
  children: unknown,
  injected: Required<MenubarContentInjectedProps>
) {
  let surfaceIndex = 0;
  let subIndex = 0;

  return mapSurfaceChildren(
    children,
    (element) => {
      if (element.type === MenubarItem) {
        const index = surfaceIndex;
        surfaceIndex += 1;
        return {
          ...element,
          props: {
            ...element.props,
            ...injected,
            __surfaceIndex: index,
            __surfaceId: resolvePartId(injected.__contentId, `item-${index}`),
            __surfaceDisabled: Boolean(element.props?.disabled),
          },
        };
      }

      if (element.type === MenubarSub) {
        const index = surfaceIndex;
        surfaceIndex += 1;
        const key = element.props?.value ?? `sub-${subIndex}`;
        subIndex += 1;
        return {
          ...element,
          props: {
            ...element.props,
            ...injected,
            __surfaceIndex: index,
            __surfaceId: resolvePartId(injected.__contentId, `sub-${index}`),
            __surfaceDisabled: Boolean(
              collectJsxElements(
                element.props?.children,
                (child) => child.type === MenubarSubTrigger
              )[0]?.props?.disabled
            ),
            __subKey: key,
            __subPath: [...injected.__path, key],
          },
        };
      }

      return element;
    },
    (element) => element.type === MenubarSubContent
  );
}

export function MenubarContent(props: MenubarContentProps): JSX.Element | null;
export function MenubarContent(
  props: MenubarContentAsChildProps
): JSX.Element | null;
export function MenubarContent(
  props:
    | (MenubarContentProps &
        MenubarMenuInjectedProps &
        Partial<MenubarSurfaceInjectedProps> & { __path?: string[] })
    | (MenubarContentAsChildProps &
        MenubarMenuInjectedProps &
        Partial<MenubarSurfaceInjectedProps> & { __path?: string[] })
) {
  const {
    asChild,
    children,
    forceMount = false,
    ref,
    side = 'bottom',
    align = 'start',
    sideOffset = 0,
    __path,
    __menubarId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __menuKey,
    __menuIndex,
    __triggerId,
    __contentId,
    __contentCurrentIndex: _contentCurrentIndex,
    __setContentCurrentIndex: _setContentCurrentIndex,
    __contentItemCount: _contentItemCount,
    __contentDisabledIndexes: _contentDisabledIndexes,
    __surfaceIndex: _surfaceIndex,
    __surfaceId: _surfaceId,
    __surfaceDisabled: _surfaceDisabled,
    __subKey: _subKey,
    __subPath: _subPath,
    ...rest
  } = props;
  const injectedMenu = readMenubarMenuInjectedProps({
    __menubarId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __menuKey,
    __menuIndex,
    __triggerId,
    __contentId,
  });
  const items = collectContentItems(children);
  const currentIndexState = state(firstEnabledCompositeIndex(items));
  const currentIndex = items[currentIndexState()]
    ? currentIndexState()
    : firstEnabledCompositeIndex(items);
  const injectedContent: MenubarContentInjectedProps = {
    ...injectedMenu,
    __path: __path ?? [injectedMenu.__menuKey],
    __contentCurrentIndex: currentIndex,
    __setContentCurrentIndex: currentIndexState.set,
    __contentItemCount: items.length,
    __contentDisabledIndexes: disabledIndexes(items),
  };
  const injected = readMenubarContentInjectedProps(injectedContent);
  const open = pathIsOpen(injected.__openPath, injected.__path);
  const overlayId = _surfaceId ?? injected.__triggerId;
  const portal = getPersistentPortal(overlayId);
  const overlayNodes = getOverlayNodes(overlayId);
  const collection = getCompositeCollection(injected.__contentId);
  const nav = rovingFocus({
    currentIndex: injected.__contentCurrentIndex,
    itemCount: Math.max(injected.__contentItemCount, 1),
    orientation: 'vertical',
    loop: true,
    isDisabled: (index) => injected.__contentDisabledIndexes.includes(index),
    onNavigate: (index) => {
      injected.__setContentCurrentIndex(index);
      focusSelectedCollectionItem(collection, index);
    },
  });
  const finalProps = mergeProps(stripInternalProps(rest), {
    ...nav.container,
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        overlayNodes.content = node;
        if (node && open) {
          syncOverlayPosition(overlayId, {
            side,
            align,
            sideOffset,
          });
        } else {
          clearOverlayPosition(overlayId);
        }

        if (node && open) {
          focusSelectedCollectionItem(
            collection,
            injected.__contentCurrentIndex
          );
        }
      }
    ),
    id: injected.__contentId,
    role: 'menu',
    'aria-labelledby': injected.__triggerId,
    'data-slot': 'menubar-content',
    'data-state': open ? 'open' : 'closed',
    'data-side': side,
    'data-align': align,
    'data-side-offset': String(sideOffset),
  });
  const contentChildren = enhanceMenubarContentChildren(children, injected);
  const contentNode = asChild ? (
    <Slot asChild {...finalProps} children={contentChildren as JSX.Element} />
  ) : (
    <div {...finalProps}>{contentChildren}</div>
  );
  const rendered = (
    <Presence present={forceMount || open}>
      <FocusScope restoreFocus>
        <DismissableLayer
          onDismiss={() => {
            injected.__setOpenPath(injected.__path.slice(0, -1));
          }}
        >
          {contentNode}
        </DismissableLayer>
      </FocusScope>
    </Presence>
  );
  const PortalHost = portal;

  return (
    <>
      {portal.render({
        children: rendered,
      })}
      <PortalHost />
    </>
  );
}

export function MenubarItem(props: MenubarItemProps): JSX.Element;
export function MenubarItem(props: MenubarItemAsChildProps): JSX.Element;
export function MenubarItem(
  props:
    | (MenubarItemProps & MenubarSurfaceInjectedProps)
    | (MenubarItemAsChildProps & MenubarSurfaceInjectedProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __menubarId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __menuKey,
    __menuIndex,
    __triggerId,
    __contentId,
    __path,
    __contentCurrentIndex,
    __setContentCurrentIndex,
    __contentItemCount,
    __contentDisabledIndexes,
    __surfaceIndex,
    __surfaceId,
    __surfaceDisabled,
    ...rest
  } = props;
  const injected = readMenubarSurfaceInjectedProps({
    __menubarId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __menuKey,
    __menuIndex,
    __triggerId,
    __contentId,
    __path,
    __contentCurrentIndex,
    __setContentCurrentIndex,
    __contentItemCount,
    __contentDisabledIndexes,
    __surfaceIndex,
    __surfaceId,
    __surfaceDisabled,
  });
  const collection = getCompositeCollection(injected.__contentId);
  const nav = rovingFocus({
    currentIndex: injected.__contentCurrentIndex,
    itemCount: Math.max(injected.__contentItemCount, 1),
    orientation: 'vertical',
    loop: true,
    isDisabled: (index) => injected.__contentDisabledIndexes.includes(index),
    onNavigate: (index) => {
      injected.__setContentCurrentIndex(index);
      focusSelectedCollectionItem(collection, index);
    },
  });
  const isDisabled = disabled || injected.__surfaceDisabled;
  const interactionProps = pressable({
    disabled: isDisabled,
    onPress: (event) => {
      onPress?.(event);
      if (!event.defaultPrevented) {
        injected.__setOpenPath([]);
      }
    },
    isNativeButton: !asChild,
  });
  const finalProps = mergeProps(stripInternalProps(rest), {
    ...interactionProps,
    ...nav.item(injected.__surfaceIndex),
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        getOverlayNodes(injected.__surfaceId).trigger = node;
        registerCompositeNode(injected.__surfaceId, collection, node, {
          index: injected.__surfaceIndex,
          disabled: isDisabled,
        });
      }
    ),
    id: injected.__surfaceId,
    role: 'menuitem',
    'aria-disabled': isDisabled ? 'true' : undefined,
    'data-slot': 'menubar-item',
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

export function MenubarSub(
  props: MenubarSubProps & MenubarSurfaceInjectedProps
) {
  const injected = readMenubarSurfaceInjectedProps(props);
  const enhancedChildren = mapJsxTree(props.children, (element) => {
    if (
      element.type !== MenubarSubTrigger &&
      element.type !== MenubarSubContent
    ) {
      return element;
    }

    return {
      ...element,
      props: {
        ...element.props,
        ...injected,
      },
    };
  });

  return <>{enhancedChildren}</>;
}

export function MenubarSubTrigger(props: MenubarSubTriggerProps): JSX.Element;
export function MenubarSubTrigger(
  props: MenubarSubTriggerAsChildProps
): JSX.Element;
export function MenubarSubTrigger(
  props:
    | (MenubarSubTriggerProps & MenubarSurfaceInjectedProps)
    | (MenubarSubTriggerAsChildProps & MenubarSurfaceInjectedProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __menubarId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __menuKey,
    __menuIndex,
    __triggerId,
    __contentId,
    __path,
    __contentCurrentIndex,
    __setContentCurrentIndex,
    __contentItemCount,
    __contentDisabledIndexes,
    __surfaceIndex,
    __surfaceId,
    __surfaceDisabled,
    __subKey,
    __subPath,
    ...rest
  } = props;
  const injected = readMenubarSurfaceInjectedProps({
    __menubarId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __menuKey,
    __menuIndex,
    __triggerId,
    __contentId,
    __path,
    __contentCurrentIndex,
    __setContentCurrentIndex,
    __contentItemCount,
    __contentDisabledIndexes,
    __surfaceIndex,
    __surfaceId,
    __surfaceDisabled,
    __subKey,
    __subPath,
  });
  const collection = getCompositeCollection(injected.__contentId);
  const nav = rovingFocus({
    currentIndex: injected.__contentCurrentIndex,
    itemCount: Math.max(injected.__contentItemCount, 1),
    orientation: 'vertical',
    loop: true,
    isDisabled: (index) => injected.__contentDisabledIndexes.includes(index),
    onNavigate: (index) => {
      injected.__setContentCurrentIndex(index);
      focusSelectedCollectionItem(collection, index);
    },
  });
  const isDisabled = disabled || injected.__surfaceDisabled;
  const open = pathIsOpen(injected.__openPath, injected.__subPath);
  const interactionProps = pressable({
    disabled: isDisabled,
    onPress: (event) => {
      onPress?.(event);
      if (!event.defaultPrevented) {
        injected.__setOpenPath(open ? injected.__path : injected.__subPath);
      }
    },
    isNativeButton: !asChild,
  });
  const finalProps = mergeProps(stripInternalProps(rest), {
    ...interactionProps,
    ...nav.item(injected.__surfaceIndex),
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        registerCompositeNode(injected.__surfaceId, collection, node, {
          index: injected.__surfaceIndex,
          disabled: isDisabled,
        });
      }
    ),
    id: injected.__surfaceId,
    role: 'menuitem',
    'aria-haspopup': 'menu',
    'aria-expanded': open ? 'true' : 'false',
    'data-slot': 'menubar-sub-trigger',
    'data-state': open ? 'open' : 'closed',
    'data-disabled': isDisabled ? 'true' : undefined,
    onPointerEnter: () => {
      if (!isDisabled) {
        injected.__setOpenPath(injected.__subPath);
      }
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        injected.__setOpenPath(injected.__subPath);
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

export function MenubarSubContent(
  props: MenubarSubContentProps
): JSX.Element | null;
export function MenubarSubContent(
  props: MenubarSubContentAsChildProps
): JSX.Element | null;
export function MenubarSubContent(
  props:
    | (MenubarSubContentProps & MenubarSurfaceInjectedProps)
    | (MenubarSubContentAsChildProps & MenubarSurfaceInjectedProps)
) {
  const injected = readMenubarSurfaceInjectedProps(
    props as MenubarSurfaceInjectedProps
  );
  return (
    <MenubarContent
      {...(props as MenubarSubContentProps & MenubarSurfaceInjectedProps)}
      __path={injected.__subPath}
    />
  );
}

export function MenubarGroup(
  props: MenubarGroupProps | MenubarGroupAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    role: 'group',
    'data-slot': 'menubar-group',
  });
  return asChild ? (
    <Slot asChild {...finalProps} children={children} />
  ) : (
    <div {...finalProps}>{children}</div>
  );
}

export function MenubarLabel(
  props: MenubarLabelProps | MenubarLabelAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'menubar-label',
    'data-menubar-label': 'true',
  });
  return asChild ? (
    <Slot asChild {...finalProps} children={children} />
  ) : (
    <div {...finalProps}>{children}</div>
  );
}

export function MenubarSeparator(
  props: MenubarSeparatorProps | MenubarSeparatorAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    role: 'separator',
    'data-slot': 'menubar-separator',
  });
  return asChild ? (
    <Slot asChild {...finalProps} children={children} />
  ) : (
    <div {...finalProps}>{children}</div>
  );
}
