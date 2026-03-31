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
  DialogCloseAsChildProps,
  DialogCloseProps,
  DialogContentAsChildProps,
  DialogContentProps,
  DialogDescriptionAsChildProps,
  DialogDescriptionProps,
  DialogOverlayAsChildProps,
  DialogOverlayProps,
  DialogPortalProps,
  DialogProps,
  DialogTitleAsChildProps,
  DialogTitleProps,
  DialogTriggerAsChildProps,
  DialogTriggerProps,
} from './dialog.types';

type InjectedDialogProps = {
  __dialogId?: string;
  __open?: boolean;
  __setOpen?: (open: boolean) => void;
  __modal?: boolean;
  __contentId?: string;
  __titleId?: string;
  __descriptionId?: string;
  __portal?: ReturnType<typeof getPersistentPortal>;
};

function readInjectedDialogProps(
  props: InjectedDialogProps
): Required<InjectedDialogProps> {
  if (
    !props.__dialogId ||
    props.__open === undefined ||
    !props.__setOpen ||
    props.__modal === undefined ||
    !props.__contentId ||
    !props.__titleId ||
    !props.__descriptionId ||
    !props.__portal
  ) {
    throw new Error('Dialog components must be used within <Dialog>');
  }

  return {
    __dialogId: props.__dialogId,
    __open: props.__open,
    __setOpen: props.__setOpen,
    __modal: props.__modal,
    __contentId: props.__contentId,
    __titleId: props.__titleId,
    __descriptionId: props.__descriptionId,
    __portal: props.__portal,
  };
}

export function Dialog(props: DialogProps) {
  const {
    children,
    id,
    open,
    defaultOpen = false,
    onOpenChange,
    modal = true,
  } = props;

  const openState = controllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });

  const dialogId = resolveCompoundId('dialog', id, children);
  const injectedProps: InjectedDialogProps = {
    __dialogId: dialogId,
    __open: openState(),
    __setOpen: openState.set,
    __modal: modal,
    __contentId: resolvePartId(dialogId, 'content'),
    __titleId: resolvePartId(dialogId, 'title'),
    __descriptionId: resolvePartId(dialogId, 'description'),
    __portal: getPersistentPortal(dialogId),
  };

  const enhancedChildren = mapJsxTree(children, (element) => {
    if (
      element.type !== DialogTrigger &&
      element.type !== DialogPortal &&
      element.type !== DialogOverlay &&
      element.type !== DialogContent &&
      element.type !== DialogTitle &&
      element.type !== DialogDescription &&
      element.type !== DialogClose
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

export function DialogTrigger(props: DialogTriggerProps): JSX.Element;
export function DialogTrigger(props: DialogTriggerAsChildProps): JSX.Element;
export function DialogTrigger(
  props: (DialogTriggerProps | DialogTriggerAsChildProps) & InjectedDialogProps
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
    ...rest
  } = props;
  const injected = readInjectedDialogProps({
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
  });
  const overlayNodes = getOverlayNodes(injected.__dialogId);
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
    'aria-haspopup': 'dialog',
    'aria-expanded': injected.__open ? 'true' : 'false',
    'aria-controls': injected.__contentId,
    'data-slot': 'dialog-trigger',
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

export function DialogPortal(
  props: DialogPortalProps & InjectedDialogProps
): JSX.Element | null {
  const {
    children,
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
  } = props;
  const injected = readInjectedDialogProps({
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
  });

  return injected.__portal.render({
    children,
  }) as JSX.Element | null;
}

export function DialogOverlay(props: DialogOverlayProps): JSX.Element | null;
export function DialogOverlay(
  props: DialogOverlayAsChildProps
): JSX.Element | null;
export function DialogOverlay(
  props:
    | (DialogOverlayProps & InjectedDialogProps)
    | (DialogOverlayAsChildProps & InjectedDialogProps)
) {
  const {
    asChild,
    children,
    forceMount = false,
    ref,
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
    ...rest
  } = props;
  const injected = readInjectedDialogProps({
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
  });
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'dialog-overlay',
    'data-state': injected.__open ? 'open' : 'closed',
    'data-dialog-overlay': 'true',
    'aria-hidden': 'true',
  });

  return (
    <Presence present={forceMount || injected.__open}>
      {asChild ? (
        <Slot asChild {...finalProps} children={children} />
      ) : (
        <div {...finalProps}>{children}</div>
      )}
    </Presence>
  );
}

export function DialogContent(props: DialogContentProps): JSX.Element | null;
export function DialogContent(
  props: DialogContentAsChildProps
): JSX.Element | null;
export function DialogContent(
  props:
    | (DialogContentProps & InjectedDialogProps)
    | (DialogContentAsChildProps & InjectedDialogProps)
) {
  const {
    asChild,
    children,
    forceMount = false,
    ref,
    onEscapeKeyDown,
    onPointerDownOutside,
    onInteractOutside,
    onDismiss,
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
    ...rest
  } = props;
  const injected = readInjectedDialogProps({
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
  });
  const overlayNodes = getOverlayNodes(injected.__dialogId);
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
          syncOverlayPosition(injected.__dialogId, {
            mode: 'centered',
            viewportPadding: 20,
            zIndex: 50,
          });
        } else {
          clearOverlayPosition(injected.__dialogId);
        }
      }
    ),
    id: injected.__contentId,
    role: 'dialog',
    'aria-modal': injected.__modal ? 'true' : undefined,
    'aria-labelledby': injected.__titleId,
    'aria-describedby': injected.__descriptionId,
    'data-slot': 'dialog-content',
    'data-state': injected.__open ? 'open' : 'closed',
  });

  const contentNode = asChild ? (
    <Slot asChild {...finalProps} children={children} />
  ) : (
    <div {...finalProps}>{children}</div>
  );

  return (
    <Presence present={forceMount || injected.__open}>
      <FocusScope trapped={injected.__modal} loop restoreFocus>
        <DismissableLayer
          disableOutsidePointerEvents={injected.__modal}
          onEscapeKeyDown={onEscapeKeyDown}
          onPointerDownOutside={onPointerDownOutside}
          onInteractOutside={onInteractOutside}
          onDismiss={() => {
            if (onDismiss) {
              onDismiss();
              return;
            }

            injected.__setOpen(false);
          }}
        >
          {contentNode}
        </DismissableLayer>
      </FocusScope>
    </Presence>
  );
}

export function DialogTitle(props: DialogTitleProps): JSX.Element;
export function DialogTitle(props: DialogTitleAsChildProps): JSX.Element;
export function DialogTitle(
  props:
    | (DialogTitleProps & InjectedDialogProps)
    | (DialogTitleAsChildProps & InjectedDialogProps)
) {
  const {
    asChild,
    children,
    ref,
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
    ...rest
  } = props;
  const injected = readInjectedDialogProps({
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
  });
  const finalProps = mergeProps(rest, {
    ref,
    id: injected.__titleId,
    'data-slot': 'dialog-title',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <h2 {...finalProps}>{children}</h2>;
}

export function DialogDescription(props: DialogDescriptionProps): JSX.Element;
export function DialogDescription(
  props: DialogDescriptionAsChildProps
): JSX.Element;
export function DialogDescription(
  props:
    | (DialogDescriptionProps & InjectedDialogProps)
    | (DialogDescriptionAsChildProps & InjectedDialogProps)
) {
  const {
    asChild,
    children,
    ref,
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
    ...rest
  } = props;
  const injected = readInjectedDialogProps({
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
  });
  const finalProps = mergeProps(rest, {
    ref,
    id: injected.__descriptionId,
    'data-slot': 'dialog-description',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <p {...finalProps}>{children}</p>;
}

export function DialogClose(props: DialogCloseProps): JSX.Element;
export function DialogClose(props: DialogCloseAsChildProps): JSX.Element;
export function DialogClose(
  props: (DialogCloseProps | DialogCloseAsChildProps) & InjectedDialogProps
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
    __portal,
    ...rest
  } = props;
  const injected = readInjectedDialogProps({
    __dialogId,
    __open,
    __setOpen,
    __modal,
    __contentId,
    __titleId,
    __descriptionId,
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
    'data-slot': 'dialog-close',
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
