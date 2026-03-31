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
  SelectContentAsChildProps,
  SelectContentProps,
  SelectGroupAsChildProps,
  SelectGroupProps,
  SelectItemAsChildProps,
  SelectItemProps,
  SelectItemTextAsChildProps,
  SelectItemTextProps,
  SelectLabelAsChildProps,
  SelectLabelProps,
  SelectPortalProps,
  SelectProps,
  SelectSeparatorAsChildProps,
  SelectSeparatorProps,
  SelectTriggerAsChildProps,
  SelectTriggerProps,
  SelectValueAsChildProps,
  SelectValueProps,
} from './select.types';

type InjectedSelectProps = {
  __selectId?: string;
  __open?: boolean;
  __setOpen?: (open: boolean) => void;
  __contentId?: string;
  __portal?: ReturnType<typeof getPersistentPortal>;
  __value?: string;
  __setValue?: (value: string) => void;
  __currentIndex?: number;
  __setCurrentIndex?: (index: number) => void;
  __itemCount?: number;
  __disabledIndexes?: number[];
  __selectedText?: string;
};

function readInjectedSelectProps(
  props: InjectedSelectProps
): Required<InjectedSelectProps> {
  if (
    !props.__selectId ||
    props.__open === undefined ||
    !props.__setOpen ||
    !props.__contentId ||
    !props.__portal ||
    props.__value === undefined ||
    !props.__setValue ||
    props.__currentIndex === undefined ||
    !props.__setCurrentIndex ||
    props.__itemCount === undefined ||
    !props.__disabledIndexes ||
    props.__selectedText === undefined
  ) {
    throw new Error('Select components must be used within <Select>');
  }

  return {
    __selectId: props.__selectId,
    __open: props.__open,
    __setOpen: props.__setOpen,
    __contentId: props.__contentId,
    __portal: props.__portal,
    __value: props.__value,
    __setValue: props.__setValue,
    __currentIndex: props.__currentIndex,
    __setCurrentIndex: props.__setCurrentIndex,
    __itemCount: props.__itemCount,
    __disabledIndexes: props.__disabledIndexes,
    __selectedText: props.__selectedText,
  };
}

export function Select(props: SelectProps) {
  const {
    children,
    id,
    value,
    defaultValue = '',
    onValueChange,
    open,
    defaultOpen = false,
    onOpenChange,
    name,
    disabled = false,
  } = props;
  const selectId = resolveCompoundId('select', id, children);
  const valueState = controllableState({
    value,
    defaultValue,
    onChange: onValueChange,
  });
  const openState = controllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const items = collectItemMetadata(children, SelectItem);
  const selectedIndex = items.findIndex((item) => item.value === valueState());
  const currentIndexState = state(
    selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(items)
  );
  const currentIndex =
    selectedIndex >= 0
      ? selectedIndex
      : items[currentIndexState()]
        ? currentIndexState()
        : firstEnabledIndex(items);
  const selectedText =
    items.find((item) => item.value === valueState())?.text ?? '';
  const injectedProps: InjectedSelectProps = {
    __selectId: selectId,
    __open: openState(),
    __setOpen: openState.set,
    __contentId: resolvePartId(selectId, 'content'),
    __portal: getPersistentPortal(selectId),
    __value: valueState(),
    __setValue: valueState.set,
    __currentIndex: currentIndex,
    __setCurrentIndex: currentIndexState.set,
    __itemCount: items.length,
    __disabledIndexes: items
      .map((item, index) => (item.disabled ? index : -1))
      .filter((index) => index !== -1),
    __selectedText: selectedText,
  };
  let itemIndex = 0;
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (
      element.type !== SelectTrigger &&
      element.type !== SelectValue &&
      element.type !== SelectPortal &&
      element.type !== SelectContent &&
      element.type !== SelectItem
    ) {
      return element;
    }

    if (element.type === SelectItem) {
      const nextItemIndex = itemIndex;
      itemIndex += 1;
      return {
        ...element,
        props: {
          ...element.props,
          ...injectedProps,
          __itemIndex: nextItemIndex,
          __itemId: resolvePartId(selectId, `item-${nextItemIndex}`),
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
      {name ? (
        <input
          type="hidden"
          name={name}
          value={valueState()}
          disabled={disabled}
        />
      ) : null}
    </>
  );
}

export function SelectTrigger(props: SelectTriggerProps): JSX.Element;
export function SelectTrigger(props: SelectTriggerAsChildProps): JSX.Element;
export function SelectTrigger(
  props: (SelectTriggerProps | SelectTriggerAsChildProps) & InjectedSelectProps
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __selectId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __value,
    __setValue,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __selectedText,
    ...rest
  } = props;
  const injected = readInjectedSelectProps({
    __selectId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __value,
    __setValue,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __selectedText,
  });
  const overlayNodes = getOverlayNodes(injected.__selectId);
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
    'aria-haspopup': 'listbox',
    'aria-expanded': injected.__open ? 'true' : 'false',
    'aria-controls': injected.__contentId,
    'data-slot': 'select-trigger',
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

export function SelectValue(props: SelectValueProps): JSX.Element;
export function SelectValue(props: SelectValueAsChildProps): JSX.Element;
export function SelectValue(
  props: (SelectValueProps | SelectValueAsChildProps) & InjectedSelectProps
) {
  const {
    asChild,
    children,
    placeholder,
    ref,
    __selectId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __value,
    __setValue,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __selectedText,
    ...rest
  } = props;
  const injected = readInjectedSelectProps({
    __selectId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __value,
    __setValue,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __selectedText,
  });
  const renderedChildren =
    children ?? (injected.__selectedText || placeholder || null);
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'select-value',
    'data-placeholder':
      !injected.__selectedText && placeholder ? 'true' : undefined,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children as JSX.Element} />;
  }

  return <span {...finalProps}>{renderedChildren}</span>;
}

export function SelectPortal(
  props: SelectPortalProps & InjectedSelectProps
): JSX.Element | null {
  const injected = readInjectedSelectProps(props);

  return injected.__portal.render({
    children: props.children,
  }) as JSX.Element | null;
}

export function SelectContent(props: SelectContentProps): JSX.Element | null;
export function SelectContent(
  props: SelectContentAsChildProps
): JSX.Element | null;
export function SelectContent(
  props:
    | (SelectContentProps & InjectedSelectProps)
    | (SelectContentAsChildProps & InjectedSelectProps)
) {
  const {
    asChild,
    children,
    forceMount = false,
    ref,
    side = 'bottom',
    align = 'start',
    sideOffset = 0,
    __selectId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __value,
    __setValue,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __selectedText,
    ...rest
  } = props;
  const injected = readInjectedSelectProps({
    __selectId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __value,
    __setValue,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __selectedText,
  });
  const overlayNodes = getOverlayNodes(injected.__selectId);
  const collection = getMenuCollection(injected.__selectId);
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
          syncOverlayPosition(injected.__selectId, {
            side,
            align,
            sideOffset,
            matchTriggerWidth: true,
          });
        } else {
          clearOverlayPosition(injected.__selectId);
        }

        if (node && injected.__open) {
          focusSelectedCollectionItem(collection, injected.__currentIndex);
        }
      }
    ),
    id: injected.__contentId,
    role: 'listbox',
    'data-slot': 'select-content',
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

type SelectItemInjectedProps = InjectedSelectProps & {
  __itemIndex?: number;
  __itemId?: string;
};

function readInjectedSelectItemProps(
  props: SelectItemInjectedProps
): Required<SelectItemInjectedProps> {
  const injected = readInjectedSelectProps(props);

  if (props.__itemIndex === undefined || !props.__itemId) {
    throw new Error('SelectItem must be used within <Select>');
  }

  return {
    ...injected,
    __itemIndex: props.__itemIndex,
    __itemId: props.__itemId,
  };
}

export function SelectItem(props: SelectItemProps): JSX.Element;
export function SelectItem(props: SelectItemAsChildProps): JSX.Element;
export function SelectItem(
  props:
    | (SelectItemProps & SelectItemInjectedProps)
    | (SelectItemAsChildProps & SelectItemInjectedProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    value,
    ref,
    type: typeProp,
    __selectId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __value,
    __setValue,
    __selectedText,
    __itemIndex,
    __itemId,
    ...rest
  } = props;
  const injected = readInjectedSelectItemProps({
    __selectId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    __currentIndex,
    __setCurrentIndex,
    __itemCount,
    __disabledIndexes,
    __value,
    __setValue,
    __selectedText,
    __itemIndex,
    __itemId,
  });
  const collection = getMenuCollection(injected.__selectId);
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
  const selected = injected.__value === value;
  const interactionProps = pressable({
    disabled,
    onPress: (event) => {
      if (event.defaultPrevented) {
        return;
      }

      injected.__setValue(value);
      injected.__setCurrentIndex(injected.__itemIndex);
      injected.__setOpen(false);
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
          value,
        });
      }
    ),
    id: injected.__itemId,
    role: 'option',
    'aria-selected': selected ? 'true' : 'false',
    'data-slot': 'select-item',
    'data-state': selected ? 'checked' : 'unchecked',
    'data-disabled': disabled ? 'true' : undefined,
    'aria-disabled': disabled ? 'true' : undefined,
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

export function SelectItemText(props: SelectItemTextProps): JSX.Element;
export function SelectItemText(props: SelectItemTextAsChildProps): JSX.Element;
export function SelectItemText(
  props: SelectItemTextProps | SelectItemTextAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'select-item-text',
    'data-select-item-text': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <span {...finalProps}>{children}</span>;
}

export function SelectGroup(props: SelectGroupProps): JSX.Element;
export function SelectGroup(props: SelectGroupAsChildProps): JSX.Element;
export function SelectGroup(props: SelectGroupProps | SelectGroupAsChildProps) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    role: 'group',
    'data-slot': 'select-group',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function SelectLabel(props: SelectLabelProps): JSX.Element;
export function SelectLabel(props: SelectLabelAsChildProps): JSX.Element;
export function SelectLabel(props: SelectLabelProps | SelectLabelAsChildProps) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'select-label',
    'data-select-label': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function SelectSeparator(props: SelectSeparatorProps): JSX.Element;
export function SelectSeparator(
  props: SelectSeparatorAsChildProps
): JSX.Element;
export function SelectSeparator(
  props: SelectSeparatorProps | SelectSeparatorAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    role: 'separator',
    'data-slot': 'select-separator',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
