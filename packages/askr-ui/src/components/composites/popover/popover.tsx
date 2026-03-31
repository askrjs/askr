import {
  Presence,
  Slot,
  composeRefs,
  controllableState,
  mergeProps,
  pressable,
} from '@askrjs/askr/foundations';
import { DismissableLayer } from '../../composites/dismissable-layer';
import { FocusScope } from '../../composites/focus-scope';
import { resolveCompoundId, resolvePartId } from '../../_internal/id';
import { mapJsxTree } from '../../_internal/jsx';
import {
  clearOverlayPosition,
  getOverlayNodes,
  getPersistentPortal,
  syncOverlayPosition,
} from '../../_internal/overlay';
import type {
  PopoverCloseAsChildProps,
  PopoverCloseProps,
  PopoverContentAsChildProps,
  PopoverContentProps,
  PopoverPortalProps,
  PopoverProps,
  PopoverTriggerAsChildProps,
  PopoverTriggerProps,
} from './popover.types';

type InjectedPopoverProps = {
  __popoverId?: string;
  __open?: boolean;
  __setOpen?: (open: boolean) => void;
  __triggerId?: string;
  __contentId?: string;
  __portal?: ReturnType<typeof getPersistentPortal>;
};

function readInjectedPopoverProps(
  props: InjectedPopoverProps
): Required<InjectedPopoverProps> {
  if (
    !props.__popoverId ||
    props.__open === undefined ||
    !props.__setOpen ||
    !props.__triggerId ||
    !props.__contentId ||
    !props.__portal
  ) {
    throw new Error('Popover components must be used within <Popover>');
  }

  return {
    __popoverId: props.__popoverId,
    __open: props.__open,
    __setOpen: props.__setOpen,
    __triggerId: props.__triggerId,
    __contentId: props.__contentId,
    __portal: props.__portal,
  };
}

export function Popover(props: PopoverProps) {
  const { children, id, open, defaultOpen = false, onOpenChange } = props;
  const openState = controllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const popoverId = resolveCompoundId('popover', id, children);
  const injectedProps: InjectedPopoverProps = {
    __popoverId: popoverId,
    __open: openState(),
    __setOpen: openState.set,
    __triggerId: resolvePartId(popoverId, 'trigger'),
    __contentId: resolvePartId(popoverId, 'content'),
    __portal: getPersistentPortal(popoverId),
  };
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (
      element.type !== PopoverTrigger &&
      element.type !== PopoverPortal &&
      element.type !== PopoverContent &&
      element.type !== PopoverClose
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
  const PortalHost = injectedProps.__portal;

  return (
    <>
      {enhancedChildren}
      {PortalHost ? <PortalHost /> : null}
    </>
  );
}

export function PopoverTrigger(props: PopoverTriggerProps): JSX.Element;
export function PopoverTrigger(props: PopoverTriggerAsChildProps): JSX.Element;
export function PopoverTrigger(
  props: (PopoverTriggerProps | PopoverTriggerAsChildProps) &
    InjectedPopoverProps
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __popoverId,
    __open,
    __setOpen,
    __triggerId,
    __contentId,
    __portal,
    ...rest
  } = props;
  const injected = readInjectedPopoverProps({
    __popoverId,
    __open,
    __setOpen,
    __triggerId,
    __contentId,
    __portal,
  });
  const overlayNodes = getOverlayNodes(injected.__popoverId);
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
    id: injected.__triggerId,
    'aria-haspopup': 'dialog',
    'aria-expanded': injected.__open ? 'true' : 'false',
    'aria-controls': injected.__contentId,
    'data-slot': 'popover-trigger',
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

export function PopoverPortal(
  props: PopoverPortalProps & InjectedPopoverProps
): JSX.Element | null {
  const {
    children,
    __popoverId,
    __open,
    __setOpen,
    __triggerId,
    __contentId,
    __portal,
  } = props;
  const injected = readInjectedPopoverProps({
    __popoverId,
    __open,
    __setOpen,
    __triggerId,
    __contentId,
    __portal,
  });

  return injected.__portal.render({
    children,
  }) as JSX.Element | null;
}

export function PopoverContent(props: PopoverContentProps): JSX.Element | null;
export function PopoverContent(
  props: PopoverContentAsChildProps
): JSX.Element | null;
export function PopoverContent(
  props:
    | (PopoverContentProps & InjectedPopoverProps)
    | (PopoverContentAsChildProps & InjectedPopoverProps)
) {
  const {
    asChild,
    children,
    forceMount = false,
    ref,
    side = 'bottom',
    align = 'center',
    sideOffset = 0,
    __popoverId,
    __open,
    __setOpen,
    __triggerId,
    __contentId,
    __portal,
    ...rest
  } = props;
  const injected = readInjectedPopoverProps({
    __popoverId,
    __open,
    __setOpen,
    __triggerId,
    __contentId,
    __portal,
  });
  const overlayNodes = getOverlayNodes(injected.__popoverId);
  const restDomProps = rest as Record<string, unknown>;
  const explicitAriaLabel =
    typeof restDomProps['aria-label'] === 'string'
      ? (restDomProps['aria-label'] as string)
      : undefined;
  const explicitAriaLabelledBy =
    typeof restDomProps['aria-labelledby'] === 'string'
      ? (restDomProps['aria-labelledby'] as string)
      : undefined;
  const autoAriaLabelledBy = explicitAriaLabel
    ? undefined
    : (explicitAriaLabelledBy ?? injected.__triggerId);
  const finalProps = mergeProps(rest, {
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        overlayNodes.content = node;
        if (node && injected.__open) {
          syncOverlayPosition(injected.__popoverId, {
            side,
            align,
            sideOffset,
          });
        } else {
          clearOverlayPosition(injected.__popoverId);
        }
      }
    ),
    id: injected.__contentId,
    role: 'dialog',
    'aria-labelledby': autoAriaLabelledBy,
    tabIndex: -1,
    'data-slot': 'popover-content',
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

export function PopoverClose(props: PopoverCloseProps): JSX.Element;
export function PopoverClose(props: PopoverCloseAsChildProps): JSX.Element;
export function PopoverClose(
  props: (PopoverCloseProps | PopoverCloseAsChildProps) & InjectedPopoverProps
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __popoverId,
    __open,
    __setOpen,
    __triggerId,
    __contentId,
    __portal,
    ...rest
  } = props;
  const injected = readInjectedPopoverProps({
    __popoverId,
    __open,
    __setOpen,
    __triggerId,
    __contentId,
    __portal,
  });
  const interactionProps = pressable({
    disabled,
    onPress: (event) => {
      onPress?.(event);
      if (!event.defaultPrevented) {
        injected.__setOpen(false);
      }
    },
    isNativeButton: !asChild,
  });
  const finalProps = mergeProps(rest, {
    ...interactionProps,
    ref,
    'data-slot': 'popover-close',
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
