import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from '../../composites/dialog';
import { DialogClose } from '../../composites/dialog/dialog';
import { resolveCompoundId } from '../../_internal/id';
import { mapJsxTree } from '../../_internal/jsx';
import { getPersistentPortal } from '../../_internal/overlay';
import type {
  AlertDialogActionAsChildProps,
  AlertDialogActionProps,
  AlertDialogCancelAsChildProps,
  AlertDialogCancelProps,
  AlertDialogContentAsChildProps,
  AlertDialogContentProps,
  AlertDialogDescriptionAsChildProps,
  AlertDialogDescriptionProps,
  AlertDialogOverlayAsChildProps,
  AlertDialogOverlayProps,
  AlertDialogPortalProps,
  AlertDialogProps,
  AlertDialogTitleAsChildProps,
  AlertDialogTitleProps,
  AlertDialogTriggerAsChildProps,
  AlertDialogTriggerProps,
} from './alert-dialog.types';

type InjectedAlertDialogProps = {
  __dialogId?: string;
  __open?: boolean;
  __setOpen?: (open: boolean) => void;
  __modal?: boolean;
  __contentId?: string;
  __titleId?: string;
  __descriptionId?: string;
  __portal?: ReturnType<typeof getPersistentPortal>;
};

function readInjectedAlertDialogProps(props: InjectedAlertDialogProps) {
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
    throw new Error('AlertDialog components must be used within <AlertDialog>');
  }

  return props as Required<InjectedAlertDialogProps>;
}

export function AlertDialog(props: AlertDialogProps) {
  const { children, id } = props;
  const alertDialogId = resolveCompoundId('alert-dialog', id, children);

  const enhancedChildren = mapJsxTree(children, (element) => {
    if (element.type === AlertDialogTrigger) {
      return {
        ...element,
        type: DialogTrigger,
      };
    }

    if (element.type === AlertDialogPortal) {
      return {
        ...element,
        type: DialogPortal,
      };
    }

    if (element.type === AlertDialogOverlay) {
      return {
        ...element,
        type: DialogOverlay,
      };
    }

    if (element.type === AlertDialogContent) {
      return {
        ...element,
        type: DialogContent,
      };
    }

    if (element.type === AlertDialogTitle) {
      return {
        ...element,
        type: DialogTitle,
      };
    }

    if (element.type === AlertDialogDescription) {
      return {
        ...element,
        type: DialogDescription,
      };
    }

    if (
      element.type === AlertDialogAction ||
      element.type === AlertDialogCancel
    ) {
      return {
        ...element,
        type: DialogClose,
      };
    }

    return element;
  });

  return (
    <Dialog {...props} id={alertDialogId} modal={true}>
      {enhancedChildren}
    </Dialog>
  );
}

export function AlertDialogTrigger(
  props: AlertDialogTriggerProps | AlertDialogTriggerAsChildProps
) {
  return props.asChild ? (
    <DialogTrigger {...props} />
  ) : (
    <DialogTrigger {...props} />
  );
}

export function AlertDialogPortal(
  props: AlertDialogPortalProps & InjectedAlertDialogProps
): JSX.Element | null {
  readInjectedAlertDialogProps(props);
  return <DialogPortal {...props} />;
}

export function AlertDialogOverlay(
  props:
    | (AlertDialogOverlayProps & InjectedAlertDialogProps)
    | (AlertDialogOverlayAsChildProps & InjectedAlertDialogProps)
) {
  readInjectedAlertDialogProps(props);
  return props.asChild ? (
    <DialogOverlay {...props} />
  ) : (
    <DialogOverlay {...props} />
  );
}

export function AlertDialogContent(
  props:
    | (AlertDialogContentProps & InjectedAlertDialogProps)
    | (AlertDialogContentAsChildProps & InjectedAlertDialogProps)
) {
  const injected = readInjectedAlertDialogProps(props);

  return props.asChild ? (
    <DialogContent
      {...props}
      onDismiss={undefined}
      onEscapeKeyDown={() => {
        injected.__setOpen(false);
      }}
      onPointerDownOutside={(event: PointerEvent) => {
        event.preventDefault();
      }}
    />
  ) : (
    <DialogContent
      {...props}
      onDismiss={undefined}
      onEscapeKeyDown={() => {
        injected.__setOpen(false);
      }}
      onPointerDownOutside={(event: PointerEvent) => {
        event.preventDefault();
      }}
    />
  );
}

export function AlertDialogTitle(
  props:
    | (AlertDialogTitleProps & InjectedAlertDialogProps)
    | (AlertDialogTitleAsChildProps & InjectedAlertDialogProps)
) {
  readInjectedAlertDialogProps(props);
  return props.asChild ? (
    <DialogTitle {...props} />
  ) : (
    <DialogTitle {...props} />
  );
}

export function AlertDialogDescription(
  props:
    | (AlertDialogDescriptionProps & InjectedAlertDialogProps)
    | (AlertDialogDescriptionAsChildProps & InjectedAlertDialogProps)
) {
  readInjectedAlertDialogProps(props);
  return props.asChild ? (
    <DialogDescription {...props} />
  ) : (
    <DialogDescription {...props} />
  );
}

export function AlertDialogAction(
  props:
    | (AlertDialogActionProps & InjectedAlertDialogProps)
    | (AlertDialogActionAsChildProps & InjectedAlertDialogProps)
) {
  readInjectedAlertDialogProps(props);
  return props.asChild ? (
    <DialogClose {...props} />
  ) : (
    <DialogClose {...props} />
  );
}

export function AlertDialogCancel(
  props:
    | (AlertDialogCancelProps & InjectedAlertDialogProps)
    | (AlertDialogCancelAsChildProps & InjectedAlertDialogProps)
) {
  readInjectedAlertDialogProps(props);
  return props.asChild ? (
    <DialogClose {...props} />
  ) : (
    <DialogClose {...props} />
  );
}
