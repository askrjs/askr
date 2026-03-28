import {
  Presence,
  Slot,
  composeRefs,
  controllableState,
  mergeProps,
  pressable,
} from '@askrjs/askr/foundations';
import { resource } from '@askrjs/askr/resources';
import { DismissableLayer } from '../../composites/dismissable-layer';
import { resolveCompoundId, resolvePartId } from '../../_internal/id';
import { collectJsxElements, mapJsxTree } from '../../_internal/jsx';
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
  __titleId?: string;
  __descriptionId?: string;
};

type ToastStateInjectedProps = InjectedToastProps & {
  __open?: boolean;
  __setOpen?: (open: boolean) => void;
};

type ToastLifecycleEntry = {
  node: HTMLElement | null;
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
    timer: null,
    previousFocused: null,
  };
  toastEntries.set(toastId, created);
  return created;
}

function clearToastTimer(entry: ToastLifecycleEntry) {
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
}

function restoreToastFocus(entry: ToastLifecycleEntry) {
  const previousFocused = entry.previousFocused;
  entry.previousFocused = null;

  if (
    previousFocused &&
    (!entry.node ||
      !(
        document.activeElement instanceof HTMLElement &&
        entry.node.contains(document.activeElement)
      ))
  ) {
    previousFocused.focus?.();
  }
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
  props: ToastStateInjectedProps
): Required<ToastStateInjectedProps> {
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
  const injectedToastProps: InjectedToastProps = {
    ...providerProps,
    __toastId: toastId,
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
    open,
    defaultOpen = true,
    onOpenChange,
    duration,
    variant,
    ref,
    __providerId,
    __duration,
    __toastId,
    __titleId,
    __descriptionId,
    ...rest
  } = props;
  const openState = controllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const injected = readInjectedToastProps({
    __providerId,
    __duration,
    __toastId,
    __open: openState(),
    __setOpen: openState.set,
    __titleId,
    __descriptionId,
  });
  const entry = getToastEntry(injected.__toastId);
  const resolvedDuration = duration ?? injected.__duration;

  resource(
    ({ signal }) => {
      if (!injected.__open) {
        return null;
      }

      if (entry.previousFocused === null) {
        entry.previousFocused =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      }

      clearToastTimer(entry);

      const timeoutId = setTimeout(() => {
        if (entry.timer === timeoutId) {
          entry.timer = null;
        }

        injected.__setOpen(false);
      }, resolvedDuration);

      entry.timer = timeoutId;
      signal.addEventListener(
        'abort',
        () => {
          if (entry.timer === timeoutId) {
            clearTimeout(timeoutId);
            entry.timer = null;
          }
        },
        { once: true }
      );

      return null;
    },
    [injected.__toastId, injected.__open, resolvedDuration]
  );

  resource(() => {
    if (injected.__open) {
      return null;
    }

    clearToastTimer(entry);
    restoreToastFocus(entry);
    return null;
  }, [injected.__toastId, injected.__open]);

  resource(
    ({ signal }) => {
      signal.addEventListener(
        'abort',
        () => {
          clearToastTimer(entry);
          restoreToastFocus(entry);
          entry.node = null;
          toastEntries.delete(injected.__toastId);
        },
        { once: true }
      );

      return null;
    },
    [injected.__toastId]
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
    'data-variant': variant && variant !== 'default' ? variant : undefined,
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
    | (ToastTitleProps & ToastStateInjectedProps)
    | (ToastTitleAsChildProps & ToastStateInjectedProps)
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
    | (ToastDescriptionProps & ToastStateInjectedProps)
    | (ToastDescriptionAsChildProps & ToastStateInjectedProps)
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
    | (ToastActionProps & ToastStateInjectedProps)
    | (ToastActionAsChildProps & ToastStateInjectedProps)
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
    | (ToastCloseProps & ToastStateInjectedProps)
    | (ToastCloseAsChildProps & ToastStateInjectedProps)
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
