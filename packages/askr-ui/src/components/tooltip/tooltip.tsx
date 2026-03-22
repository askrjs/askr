import {
  Presence,
  Slot,
  composeRefs,
  controllableState,
  hoverable,
  mergeProps,
} from '@askrjs/askr/foundations';
import { DismissableLayer } from '../dismissable-layer';
import { resolveCompoundId, resolvePartId } from '../_internal/id';
import { mapJsxTree } from '../_internal/jsx';
import { getOverlayNodes, getPersistentPortal } from '../_internal/overlay';
import type {
  TooltipContentAsChildProps,
  TooltipContentProps,
  TooltipPortalProps,
  TooltipProps,
  TooltipTriggerAsChildProps,
  TooltipTriggerProps,
} from './tooltip.types';

type InjectedTooltipProps = {
  __tooltipId?: string;
  __open?: boolean;
  __setOpen?: (open: boolean) => void;
  __contentId?: string;
  __portal?: ReturnType<typeof getPersistentPortal>;
};

function readInjectedTooltipProps(
  props: InjectedTooltipProps
): Required<InjectedTooltipProps> {
  if (
    !props.__tooltipId ||
    props.__open === undefined ||
    !props.__setOpen ||
    !props.__contentId ||
    !props.__portal
  ) {
    throw new Error('Tooltip components must be used within <Tooltip>');
  }

  return {
    __tooltipId: props.__tooltipId,
    __open: props.__open,
    __setOpen: props.__setOpen,
    __contentId: props.__contentId,
    __portal: props.__portal,
  };
}

export function Tooltip(props: TooltipProps) {
  const { children, id, open, defaultOpen = false, onOpenChange } = props;
  const openState = controllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const tooltipId = resolveCompoundId('tooltip', id, children);
  const injectedProps: InjectedTooltipProps = {
    __tooltipId: tooltipId,
    __open: openState(),
    __setOpen: openState.set,
    __contentId: resolvePartId(tooltipId, 'content'),
    __portal: getPersistentPortal(tooltipId),
  };
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (
      element.type !== TooltipTrigger &&
      element.type !== TooltipPortal &&
      element.type !== TooltipContent
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

  return (
    <>
      {enhancedChildren}
      {injectedProps.__portal ? injectedProps.__portal() : null}
    </>
  );
}

export function TooltipTrigger(props: TooltipTriggerProps): JSX.Element;
export function TooltipTrigger(props: TooltipTriggerAsChildProps): JSX.Element;
export function TooltipTrigger(
  props: (TooltipTriggerProps | TooltipTriggerAsChildProps) &
    InjectedTooltipProps
) {
  const {
    asChild,
    children,
    disabled = false,
    ref,
    type: typeProp,
    __tooltipId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    ...rest
  } = props;
  const injected = readInjectedTooltipProps({
    __tooltipId,
    __open,
    __setOpen,
    __contentId,
    __portal,
  });
  const overlayNodes = getOverlayNodes(injected.__tooltipId);
  const hoverProps = hoverable({
    disabled,
    onEnter: () => {
      injected.__setOpen(true);
    },
    onLeave: () => {
      injected.__setOpen(false);
    },
  });
  const finalProps = mergeProps(rest, {
    ...hoverProps,
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
    onFocus: () => {
      injected.__setOpen(true);
    },
    onBlur: () => {
      injected.__setOpen(false);
    },
    'aria-describedby': injected.__open ? injected.__contentId : undefined,
    'data-slot': 'tooltip-trigger',
    'data-disabled': disabled ? 'true' : undefined,
    'data-state': injected.__open ? 'open' : 'closed',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return (
    <button type={typeProp ?? 'button'} disabled={disabled} {...finalProps}>
      {children}
    </button>
  );
}

export function TooltipPortal(
  props: TooltipPortalProps & InjectedTooltipProps
) {
  const { children, __tooltipId, __open, __setOpen, __contentId, __portal } =
    props;
  const injected = readInjectedTooltipProps({
    __tooltipId,
    __open,
    __setOpen,
    __contentId,
    __portal,
  });

  return injected.__portal.render({
    children,
  });
}

export function TooltipContent(props: TooltipContentProps): JSX.Element | null;
export function TooltipContent(
  props: TooltipContentAsChildProps
): JSX.Element | null;
export function TooltipContent(
  props:
    | (TooltipContentProps & InjectedTooltipProps)
    | (TooltipContentAsChildProps & InjectedTooltipProps)
) {
  const {
    asChild,
    children,
    forceMount = false,
    ref,
    side = 'top',
    align = 'center',
    sideOffset = 0,
    __tooltipId,
    __open,
    __setOpen,
    __contentId,
    __portal,
    ...rest
  } = props;
  const injected = readInjectedTooltipProps({
    __tooltipId,
    __open,
    __setOpen,
    __contentId,
    __portal,
  });
  const overlayNodes = getOverlayNodes(injected.__tooltipId);
  const finalProps = mergeProps(rest, {
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        overlayNodes.content = node;
      }
    ),
    id: injected.__contentId,
    role: 'tooltip',
    'data-slot': 'tooltip-content',
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
      <DismissableLayer
        onEscapeKeyDown={() => {
          injected.__setOpen(false);
        }}
      >
        {contentNode}
      </DismissableLayer>
    </Presence>
  );
}
