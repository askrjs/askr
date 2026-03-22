import {
  Presence,
  Slot,
  composeRefs,
  controllableState,
  mergeProps,
  pressable,
} from '@askrjs/askr/foundations';
import { DismissableLayer } from '../dismissable-layer';
import { resolveCompoundId, resolvePartId } from '../_internal/id';
import { collectJsxElements, mapJsxTree } from '../_internal/jsx';
import type {
  ToastActionAsChildProps,
  ToastActionProps,
  ToastCloseAsChildProps,
  ToastCloseProps,
  ToastDescriptionAsChildProps,
  ToastDescriptionProps,
  ToastProps,
  ToastProviderProps,
  ToastTitleAsChildProps,
  ToastTitleProps,
  ToastViewportAsChildProps,
  ToastViewportProps,
} from './toast.types';

type InjectedToastProviderProps = {
  __providerId?: string;
  __duration?: number;
};

type InjectedToastProps = InjectedToastProviderProps & {
  __toastId?: string;
  __open?: boolean;
  __setOpen?: (open: boolean) => void;
  __titleId?: string;
  __descriptionId?: string;
};

type ToastLifecycleEntry = {
  node: HTMLElement | null;
  open: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  previousFocused: HTMLElement | null;
};

const toastEntries = new Map<string, ToastLifecycleEntry>();

function getToastEntry(toastId: string) {
  const existing = toastEntries.get(toastId);

  if (existing) {
    return existing;
  }

  const created: ToastLifecycleEntry = {
    node: null,
    open: false,
    timer: null,
    previousFocused: null,
  };
  toastEntries.set(toastId, created);
  return created;
}

function readInjectedToastProviderProps(
  props: InjectedToastProviderProps
): Required<InjectedToastProviderProps> {
  if (!props.__providerId || props.__duration === undefined) {
    throw new Error('Toast components must be used within <ToastProvider>');
  }

  return {
    __providerId: props.__providerId,
    __duration: props.__duration,
  };
}

function readInjectedToastProps(
  props: InjectedToastProps
): Required<InjectedToastProps> {
  const provider = readInjectedToastProviderProps(props);

  if (
    !props.__toastId ||
    props.__open === undefined ||
    !props.__setOpen ||
    !props.__titleId ||
    !props.__descriptionId
  ) {
    throw new Error('Toast parts must be used within <Toast>');
  }

  return {
    ...provider,
    __toastId: props.__toastId,
    __open: props.__open,
    __setOpen: props.__setOpen,
    __titleId: props.__titleId,
    __descriptionId: props.__descriptionId,
  };
}

function syncToastLifecycle(
  toastId: string,
  open: boolean,
  duration: number,
  setOpen: (open: boolean) => void
) {
  const entry = getToastEntry(toastId);

  if (open && !entry.open) {
    entry.previousFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (entry.timer) {
      clearTimeout(entry.timer);
    }

    entry.timer = setTimeout(() => {
      setOpen(false);
    }, duration);
  }

  if (!open && entry.open) {
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }

    if (
      entry.previousFocused &&
      (!entry.node ||
        !(
          document.activeElement instanceof HTMLElement &&
          entry.node.contains(document.activeElement)
        ))
    ) {
      entry.previousFocused.focus?.();
    }
  }

  entry.open = open;
}

function enhanceToastElement(
  element: JSX.Element,
  providerProps: Required<InjectedToastProviderProps>,
  index: number
) {
  const toastId = resolveCompoundId(
    'toast',
    (element.props?.id as string | undefined) ??
      `${providerProps.__providerId}-${index}`,
    element.props?.children
  );
  const openState = controllableState({
    value: element.props?.open as boolean | undefined,
    defaultValue: (element.props?.defaultOpen as boolean | undefined) ?? true,
    onChange: element.props?.onOpenChange as
      | ((open: boolean) => void)
      | undefined,
  });
  const injectedToastProps: InjectedToastProps = {
    ...providerProps,
    __toastId: toastId,
    __open: openState(),
    __setOpen: openState.set,
    __titleId: resolvePartId(toastId, 'title'),
    __descriptionId: resolvePartId(toastId, 'description'),
  };

  return mapJsxTree(element, (node) => {
    if (
      node.type !== Toast &&
      node.type !== ToastTitle &&
      node.type !== ToastDescription &&
      node.type !== ToastAction &&
      node.type !== ToastClose
    ) {
      return node;
    }

    return {
      ...node,
      props: {
        ...node.props,
        ...injectedToastProps,
      },
    };
  });
}

export function ToastProvider(props: ToastProviderProps) {
  const { children, duration = 5000, id, ref, ...rest } = props;
  const providerId = resolveCompoundId('toast-provider', id, children);
  const providerProps: Required<InjectedToastProviderProps> = {
    __providerId: providerId,
    __duration: duration,
  };
  const toastElements = collectJsxElements(
    children,
    (element) => element.type === Toast
  ).map((element, index) =>
    enhanceToastElement(element as JSX.Element, providerProps, index)
  );
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (element.type === Toast) {
      return null;
    }

    if (element.type !== ToastViewport) {
      return element;
    }

    return {
      ...element,
      props: {
        ...element.props,
        ...providerProps,
        __toasts: toastElements,
      },
    };
  });
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'toast-provider',
    'data-toast-provider': 'true',
  });

  return <div {...finalProps}>{enhancedChildren}</div>;
}

type ToastViewportInjectedProps = InjectedToastProviderProps & {
  __toasts?: unknown[];
};

export function ToastViewport(props: ToastViewportProps): JSX.Element;
export function ToastViewport(props: ToastViewportAsChildProps): JSX.Element;
export function ToastViewport(
  props:
    | (ToastViewportProps & ToastViewportInjectedProps)
    | (ToastViewportAsChildProps & ToastViewportInjectedProps)
) {
  const {
    asChild,
    children,
    ref,
    __providerId,
    __duration,
    __toasts = [],
    ...rest
  } = props;
  readInjectedToastProviderProps({
    __providerId,
    __duration,
  });
  const content = (
    <>
      {__toasts}
      {children}
    </>
  );
  const finalProps = mergeProps(rest, {
    ref,
    role: 'region',
    'aria-live': 'polite',
    'aria-label': 'Notifications',
    'data-slot': 'toast-viewport',
    'data-toast-viewport': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={content as JSX.Element} />;
  }

  return <div {...finalProps}>{content}</div>;
}

export function Toast(
  props: ToastProps & InjectedToastProps
): JSX.Element | null {
  const {
    children,
    duration,
    ref,
    __providerId,
    __duration,
    __toastId,
    __open,
    __setOpen,
    __titleId,
    __descriptionId,
    ...rest
  } = props;
  const injected = readInjectedToastProps({
    __providerId,
    __duration,
    __toastId,
    __open,
    __setOpen,
    __titleId,
    __descriptionId,
  });
  const entry = getToastEntry(injected.__toastId);
  syncToastLifecycle(
    injected.__toastId,
    injected.__open,
    duration ?? injected.__duration,
    injected.__setOpen
  );
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (
      element.type !== ToastTitle &&
      element.type !== ToastDescription &&
      element.type !== ToastAction &&
      element.type !== ToastClose
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
  const finalProps = mergeProps(rest, {
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      (node: HTMLElement | null) => {
        entry.node = node;
      }
    ),
    id: injected.__toastId,
    role: 'status',
    'aria-live': 'polite',
    'aria-labelledby': injected.__titleId,
    'aria-describedby': injected.__descriptionId,
    'data-slot': 'toast',
    'data-state': injected.__open ? 'open' : 'closed',
    'data-toast': 'true',
  });

  return (
    <Presence present={injected.__open}>
      <DismissableLayer
        onEscapeKeyDown={() => {
          injected.__setOpen(false);
        }}
        onDismiss={() => {
          injected.__setOpen(false);
        }}
      >
        <div {...finalProps}>{enhancedChildren}</div>
      </DismissableLayer>
    </Presence>
  );
}

export function ToastTitle(props: ToastTitleProps): JSX.Element;
export function ToastTitle(props: ToastTitleAsChildProps): JSX.Element;
export function ToastTitle(
  props:
    | (ToastTitleProps & InjectedToastProps)
    | (ToastTitleAsChildProps & InjectedToastProps)
) {
  const {
    asChild,
    children,
    ref,
    __providerId,
    __duration,
    __toastId,
    __open,
    __setOpen,
    __titleId,
    __descriptionId,
    ...rest
  } = props;
  const injected = readInjectedToastProps({
    __providerId,
    __duration,
    __toastId,
    __open,
    __setOpen,
    __titleId,
    __descriptionId,
  });
  const finalProps = mergeProps(rest, {
    ref,
    id: injected.__titleId,
    'data-slot': 'toast-title',
    'data-toast-title': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function ToastDescription(props: ToastDescriptionProps): JSX.Element;
export function ToastDescription(
  props: ToastDescriptionAsChildProps
): JSX.Element;
export function ToastDescription(
  props:
    | (ToastDescriptionProps & InjectedToastProps)
    | (ToastDescriptionAsChildProps & InjectedToastProps)
) {
  const {
    asChild,
    children,
    ref,
    __providerId,
    __duration,
    __toastId,
    __open,
    __setOpen,
    __titleId,
    __descriptionId,
    ...rest
  } = props;
  const injected = readInjectedToastProps({
    __providerId,
    __duration,
    __toastId,
    __open,
    __setOpen,
    __titleId,
    __descriptionId,
  });
  const finalProps = mergeProps(rest, {
    ref,
    id: injected.__descriptionId,
    'data-slot': 'toast-description',
    'data-toast-description': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}

export function ToastAction(props: ToastActionProps): JSX.Element;
export function ToastAction(props: ToastActionAsChildProps): JSX.Element;
export function ToastAction(
  props:
    | (ToastActionProps & InjectedToastProps)
    | (ToastActionAsChildProps & InjectedToastProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __providerId,
    __duration,
    __toastId,
    __open,
    __setOpen,
    __titleId,
    __descriptionId,
    ...rest
  } = props;
  const injected = readInjectedToastProps({
    __providerId,
    __duration,
    __toastId,
    __open,
    __setOpen,
    __titleId,
    __descriptionId,
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
    'data-slot': 'toast-action',
    'data-disabled': disabled ? 'true' : undefined,
    'data-toast-action': 'true',
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

export function ToastClose(props: ToastCloseProps): JSX.Element;
export function ToastClose(props: ToastCloseAsChildProps): JSX.Element;
export function ToastClose(
  props:
    | (ToastCloseProps & InjectedToastProps)
    | (ToastCloseAsChildProps & InjectedToastProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __providerId,
    __duration,
    __toastId,
    __open,
    __setOpen,
    __titleId,
    __descriptionId,
    ...rest
  } = props;
  const injected = readInjectedToastProps({
    __providerId,
    __duration,
    __toastId,
    __open,
    __setOpen,
    __titleId,
    __descriptionId,
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
    'data-slot': 'toast-close',
    'data-disabled': disabled ? 'true' : undefined,
    'data-toast-close': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return (
    <button type={typeProp ?? 'button'} {...finalProps}>
      {children ?? 'Close'}
    </button>
  );
}
