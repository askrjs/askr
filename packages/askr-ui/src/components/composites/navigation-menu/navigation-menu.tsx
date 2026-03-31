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
  NavigationMenuContentAsChildProps,
  NavigationMenuContentProps,
  NavigationMenuIndicatorAsChildProps,
  NavigationMenuIndicatorProps,
  NavigationMenuItemProps,
  NavigationMenuLinkAsChildProps,
  NavigationMenuLinkProps,
  NavigationMenuListAsChildProps,
  NavigationMenuListProps,
  NavigationMenuProps,
  NavigationMenuSubContentAsChildProps,
  NavigationMenuSubContentProps,
  NavigationMenuSubProps,
  NavigationMenuSubTriggerAsChildProps,
  NavigationMenuSubTriggerProps,
  NavigationMenuTriggerAsChildProps,
  NavigationMenuTriggerProps,
  NavigationMenuViewportAsChildProps,
  NavigationMenuViewportProps,
} from './navigation-menu.types';

type RootInjected = {
  __navigationMenuId?: string;
  __openPath?: string[];
  __setOpenPath?: (path: string[]) => void;
  __loop?: boolean;
  __currentTriggerIndex?: number;
  __setCurrentTriggerIndex?: (index: number) => void;
  __triggerCount?: number;
  __disabledTriggerIndexes?: number[];
  __portal?: ReturnType<typeof getPersistentPortal>;
};

type ItemInjected = RootInjected & {
  __itemKey?: string;
  __itemIndex?: number;
  __triggerId?: string;
  __contentId?: string;
};

type ContentInjected = ItemInjected & {
  __path?: string[];
  __contentCurrentIndex?: number;
  __setContentCurrentIndex?: (index: number) => void;
  __contentItemCount?: number;
  __contentDisabledIndexes?: number[];
};

type SurfaceInjected = ContentInjected & {
  __surfaceIndex?: number;
  __surfaceId?: string;
  __surfaceDisabled?: boolean;
  __subKey?: string;
  __subPath?: string[];
};

function readRootInjected(props: RootInjected): Required<RootInjected> {
  if (
    !props.__navigationMenuId ||
    !props.__openPath ||
    !props.__setOpenPath ||
    props.__loop === undefined ||
    props.__currentTriggerIndex === undefined ||
    !props.__setCurrentTriggerIndex ||
    props.__triggerCount === undefined ||
    !props.__disabledTriggerIndexes ||
    !props.__portal
  ) {
    throw new Error(
      'NavigationMenu components must be used within <NavigationMenu>'
    );
  }

  return {
    __navigationMenuId: props.__navigationMenuId,
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

function readItemInjected(props: ItemInjected): Required<ItemInjected> {
  const injected = readRootInjected(props);

  if (
    !props.__itemKey ||
    props.__itemIndex === undefined ||
    !props.__triggerId ||
    !props.__contentId
  ) {
    throw new Error('NavigationMenuItem must be used within <NavigationMenu>');
  }

  return {
    ...injected,
    __itemKey: props.__itemKey,
    __itemIndex: props.__itemIndex,
    __triggerId: props.__triggerId,
    __contentId: props.__contentId,
  };
}

function readContentInjected(
  props: ContentInjected
): Required<ContentInjected> {
  const injected = readItemInjected(props);

  if (
    !props.__path ||
    props.__contentCurrentIndex === undefined ||
    !props.__setContentCurrentIndex ||
    props.__contentItemCount === undefined ||
    !props.__contentDisabledIndexes
  ) {
    throw new Error(
      'NavigationMenu content must be used within <NavigationMenuItem>'
    );
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

function readSurfaceInjected(
  props: SurfaceInjected
): Required<SurfaceInjected> {
  const injected = readContentInjected(props);

  if (
    props.__surfaceIndex === undefined ||
    !props.__surfaceId ||
    props.__surfaceDisabled === undefined
  ) {
    throw new Error(
      'NavigationMenu links and submenus must be used within content'
    );
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
    (element) =>
      element.type === NavigationMenuLink || element.type === NavigationMenuSub,
    (element) => element.type === NavigationMenuSubContent
  ).map((element) => ({
    disabled:
      element.type === NavigationMenuLink
        ? Boolean(element.props?.disabled)
        : Boolean(
            collectJsxElements(
              element.props?.children,
              (child) => child.type === NavigationMenuSubTrigger
            )[0]?.props?.disabled
          ),
  }));
}

export function NavigationMenu(props: NavigationMenuProps) {
  const { children, id, loop = true, ref, ...rest } = props;
  const navigationMenuId = resolveCompoundId('navigation-menu', id, children);
  const openPathState = state<string[]>([]);
  const triggers = collectJsxElements(
    children,
    (element) => element.type === NavigationMenuTrigger
  ).map((element) => ({
    disabled: Boolean(element.props?.disabled),
  }));
  const currentTriggerIndexState = state(firstEnabledCompositeIndex(triggers));
  const currentTriggerIndex = triggers[currentTriggerIndexState()]
    ? currentTriggerIndexState()
    : firstEnabledCompositeIndex(triggers);
  const portal = getPersistentPortal(navigationMenuId);
  let itemIndex = 0;
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (element.type === NavigationMenuItem) {
      const index = itemIndex;
      itemIndex += 1;
      const itemKey = element.props?.value ?? `item-${index}`;

      return {
        ...element,
        props: {
          ...element.props,
          __navigationMenuId: navigationMenuId,
          __openPath: openPathState(),
          __setOpenPath: openPathState.set,
          __loop: loop,
          __currentTriggerIndex: currentTriggerIndex,
          __setCurrentTriggerIndex: currentTriggerIndexState.set,
          __triggerCount: triggers.length,
          __disabledTriggerIndexes: disabledIndexes(triggers),
          __portal: getPersistentPortal(
            resolvePartId(navigationMenuId, `portal-${index}`)
          ),
          __itemKey: itemKey,
          __itemIndex: index,
          __triggerId: resolvePartId(navigationMenuId, `trigger-${index}`),
          __contentId: resolvePartId(navigationMenuId, `content-${index}`),
        },
      };
    }

    if (
      element.type === NavigationMenuList ||
      element.type === NavigationMenuViewport ||
      element.type === NavigationMenuIndicator
    ) {
      return {
        ...element,
        props: {
          ...element.props,
          __navigationMenuId: navigationMenuId,
          __openPath: openPathState(),
          __setOpenPath: openPathState.set,
          __loop: loop,
          __currentTriggerIndex: currentTriggerIndex,
          __setCurrentTriggerIndex: currentTriggerIndexState.set,
          __triggerCount: triggers.length,
          __disabledTriggerIndexes: disabledIndexes(triggers),
          __portal: portal,
        },
      };
    }

    return element;
  });
  const finalProps = mergeProps(stripInternalProps(rest), {
    ref,
    'data-slot': 'navigation-menu',
    'data-navigation-menu': 'true',
  });

  return <nav {...finalProps}>{enhancedChildren}</nav>;
}

export function NavigationMenuList(props: NavigationMenuListProps): JSX.Element;
export function NavigationMenuList(
  props: NavigationMenuListAsChildProps
): JSX.Element;
export function NavigationMenuList(
  props: (NavigationMenuListProps | NavigationMenuListAsChildProps) &
    RootInjected
) {
  const {
    asChild,
    children,
    ref,
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    ...rest
  } = props;
  const injected = readRootInjected({
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
  });
  const collection = getCompositeCollection(injected.__navigationMenuId);
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
  const finalProps = mergeProps(stripInternalProps(rest), {
    ...nav.container,
    ref,
    'data-slot': 'navigation-menu-list',
    'data-navigation-menu-list': 'true',
  });

  return asChild ? (
    <Slot asChild {...finalProps} children={children} />
  ) : (
    <div {...finalProps}>{children}</div>
  );
}

export function NavigationMenuItem(
  props: NavigationMenuItemProps & ItemInjected
) {
  const injected = readItemInjected(props);
  const path = [injected.__itemKey];
  const enhancedChildren = mapJsxTree(props.children, (element) => {
    if (
      element.type !== NavigationMenuTrigger &&
      element.type !== NavigationMenuContent
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

export function NavigationMenuTrigger(
  props: NavigationMenuTriggerProps
): JSX.Element;
export function NavigationMenuTrigger(
  props: NavigationMenuTriggerAsChildProps
): JSX.Element;
export function NavigationMenuTrigger(
  props:
    | (NavigationMenuTriggerProps & ItemInjected)
    | (NavigationMenuTriggerAsChildProps & ItemInjected)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __itemKey,
    __itemIndex,
    __triggerId,
    __contentId,
    ...rest
  } = props;
  const injected = readItemInjected({
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __itemKey,
    __itemIndex,
    __triggerId,
    __contentId,
  });
  const collection = getCompositeCollection(injected.__navigationMenuId);
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
  const open = samePath(injected.__openPath, [injected.__itemKey]);
  const interactionProps = pressable({
    disabled,
    onPress: (event) => {
      onPress?.(event);
      if (!event.defaultPrevented) {
        injected.__setOpenPath(open ? [] : [injected.__itemKey]);
      }
    },
    isNativeButton: !asChild,
  });
  const finalProps = mergeProps(stripInternalProps(rest), {
    ...interactionProps,
    ...nav.item(injected.__itemIndex),
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        getOverlayNodes(injected.__triggerId).trigger = node;
        registerCompositeNode(injected.__triggerId, collection, node, {
          index: injected.__itemIndex,
          disabled,
          value: injected.__itemKey,
        });
      }
    ),
    id: injected.__triggerId,
    'aria-expanded': open ? 'true' : 'false',
    'aria-controls': injected.__contentId,
    'data-slot': 'navigation-menu-trigger',
    'data-disabled': disabled ? 'true' : undefined,
    'data-state': open ? 'open' : 'closed',
    onFocus: () => {
      injected.__setCurrentTriggerIndex(injected.__itemIndex);
    },
    onPointerEnter: () => {
      if (injected.__openPath.length > 0) {
        injected.__setOpenPath([injected.__itemKey]);
      }
    },
  });

  return asChild ? (
    <Slot asChild {...finalProps} children={children} />
  ) : (
    <button type={typeProp ?? 'button'} {...finalProps}>
      {children}
    </button>
  );
}

function enhanceContentChildren(
  children: unknown,
  injected: Required<ContentInjected>
) {
  let surfaceIndex = 0;
  let subIndex = 0;

  return mapSurfaceChildren(
    children,
    (element) => {
      if (element.type === NavigationMenuLink) {
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

      if (element.type === NavigationMenuSub) {
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
                (child) => child.type === NavigationMenuSubTrigger
              )[0]?.props?.disabled
            ),
            __subKey: key,
            __subPath: [...injected.__path, key],
          },
        };
      }

      return element;
    },
    (element) => element.type === NavigationMenuSubContent
  );
}

export function NavigationMenuContent(
  props: NavigationMenuContentProps
): JSX.Element | null;
export function NavigationMenuContent(
  props: NavigationMenuContentAsChildProps
): JSX.Element | null;
export function NavigationMenuContent(
  props:
    | (NavigationMenuContentProps &
        ItemInjected &
        Partial<SurfaceInjected> & { __path?: string[] })
    | (NavigationMenuContentAsChildProps &
        ItemInjected &
        Partial<SurfaceInjected> & { __path?: string[] })
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
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __itemKey,
    __itemIndex,
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
  const injectedItem = readItemInjected({
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __itemKey,
    __itemIndex,
    __triggerId,
    __contentId,
  });
  const items = collectContentItems(children);
  const currentIndexState = state(firstEnabledCompositeIndex(items));
  const currentIndex = items[currentIndexState()]
    ? currentIndexState()
    : firstEnabledCompositeIndex(items);
  const injectedContent: ContentInjected = {
    ...injectedItem,
    __path: __path ?? [injectedItem.__itemKey],
    __contentCurrentIndex: currentIndex,
    __setContentCurrentIndex: currentIndexState.set,
    __contentItemCount: items.length,
    __contentDisabledIndexes: disabledIndexes(items),
  };
  const injected = readContentInjected(injectedContent);
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
    'aria-labelledby': injected.__triggerId,
    'data-slot': 'navigation-menu-content',
    'data-state': open ? 'open' : 'closed',
    'data-side': side,
    'data-align': align,
    'data-side-offset': String(sideOffset),
  });
  const contentChildren = enhanceContentChildren(children, injected);
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

export function NavigationMenuLink(props: NavigationMenuLinkProps): JSX.Element;
export function NavigationMenuLink(
  props: NavigationMenuLinkAsChildProps
): JSX.Element;
export function NavigationMenuLink(
  props:
    | (NavigationMenuLinkProps & SurfaceInjected)
    | (NavigationMenuLinkAsChildProps & SurfaceInjected)
) {
  const {
    asChild,
    children,
    ref,
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __itemKey,
    __itemIndex,
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
  const injected = readSurfaceInjected({
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __itemKey,
    __itemIndex,
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
  const finalProps = mergeProps(rest, {
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
          disabled: injected.__surfaceDisabled,
        });
      }
    ),
    id: injected.__surfaceId,
    'data-slot': 'navigation-menu-link',
    'data-navigation-menu-link': 'true',
    onClick: () => {
      injected.__setOpenPath([]);
    },
  });

  return asChild ? (
    <Slot asChild {...finalProps} children={children} />
  ) : (
    <a {...finalProps}>{children}</a>
  );
}

export function NavigationMenuViewport(
  props: NavigationMenuViewportProps
): JSX.Element;
export function NavigationMenuViewport(
  props: NavigationMenuViewportAsChildProps
): JSX.Element;
export function NavigationMenuViewport(
  props:
    | (NavigationMenuViewportProps & RootInjected)
    | (NavigationMenuViewportAsChildProps & RootInjected)
) {
  const {
    asChild,
    children,
    ref,
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    ...rest
  } = props;
  const injected = readRootInjected({
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
  });
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'navigation-menu-viewport',
    'data-navigation-menu-viewport': 'true',
    'data-state': injected.__openPath.length > 0 ? 'open' : 'closed',
    'data-active-item': injected.__openPath[0] ?? '',
  });

  return asChild ? (
    <Slot asChild {...finalProps} children={children} />
  ) : (
    <div {...finalProps}>{children}</div>
  );
}

export function NavigationMenuIndicator(
  props: NavigationMenuIndicatorProps
): JSX.Element;
export function NavigationMenuIndicator(
  props: NavigationMenuIndicatorAsChildProps
): JSX.Element;
export function NavigationMenuIndicator(
  props:
    | (NavigationMenuIndicatorProps & RootInjected)
    | (NavigationMenuIndicatorAsChildProps & RootInjected)
) {
  const {
    asChild,
    children,
    ref,
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    ...rest
  } = props;
  const injected = readRootInjected({
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
  });
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'navigation-menu-indicator',
    'data-navigation-menu-indicator': 'true',
    'data-state': injected.__openPath.length > 0 ? 'open' : 'closed',
    'data-active-item': injected.__openPath[0] ?? '',
  });

  return asChild ? (
    <Slot asChild {...finalProps} children={children} />
  ) : (
    <div {...finalProps}>{children}</div>
  );
}

export function NavigationMenuSub(
  props: NavigationMenuSubProps & SurfaceInjected
) {
  const injected = readSurfaceInjected(props);
  const enhancedChildren = mapJsxTree(props.children, (element) => {
    if (
      element.type !== NavigationMenuSubTrigger &&
      element.type !== NavigationMenuSubContent
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

export function NavigationMenuSubTrigger(
  props: NavigationMenuSubTriggerProps
): JSX.Element;
export function NavigationMenuSubTrigger(
  props: NavigationMenuSubTriggerAsChildProps
): JSX.Element;
export function NavigationMenuSubTrigger(
  props:
    | (NavigationMenuSubTriggerProps & SurfaceInjected)
    | (NavigationMenuSubTriggerAsChildProps & SurfaceInjected)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __itemKey,
    __itemIndex,
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
  const injected = readSurfaceInjected({
    __navigationMenuId,
    __openPath,
    __setOpenPath,
    __loop,
    __currentTriggerIndex,
    __setCurrentTriggerIndex,
    __triggerCount,
    __disabledTriggerIndexes,
    __portal,
    __itemKey,
    __itemIndex,
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
  const finalProps = mergeProps(rest, {
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
    'aria-haspopup': 'menu',
    'aria-expanded': open ? 'true' : 'false',
    'data-slot': 'navigation-menu-sub-trigger',
    'data-state': open ? 'open' : 'closed',
    'data-disabled': isDisabled ? 'true' : undefined,
    onPointerEnter: () => {
      if (!isDisabled) {
        injected.__setOpenPath(injected.__subPath);
      }
    },
  });

  return asChild ? (
    <Slot asChild {...finalProps} children={children} />
  ) : (
    <button type={typeProp ?? 'button'} {...finalProps}>
      {children}
    </button>
  );
}

export function NavigationMenuSubContent(
  props: NavigationMenuSubContentProps
): JSX.Element | null;
export function NavigationMenuSubContent(
  props: NavigationMenuSubContentAsChildProps
): JSX.Element | null;
export function NavigationMenuSubContent(
  props:
    | (NavigationMenuSubContentProps & SurfaceInjected)
    | (NavigationMenuSubContentAsChildProps & SurfaceInjected)
) {
  const injected = readSurfaceInjected(props as SurfaceInjected);
  return (
    <NavigationMenuContent
      {...(props as NavigationMenuSubContentProps & SurfaceInjected)}
      __path={injected.__subPath}
    />
  );
}
