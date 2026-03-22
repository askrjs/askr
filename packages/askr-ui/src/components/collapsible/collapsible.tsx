import {
  Slot,
  Presence,
  controllableState,
  composeRefs,
  formatId,
  mergeProps,
  pressable,
} from '@askrjs/askr/foundations';
import type { JSXElement } from '@askrjs/askr/foundations';
import type {
  CollapsibleContentAsChildProps,
  CollapsibleContentProps,
  CollapsibleProps,
  CollapsibleTriggerAsChildProps,
  CollapsibleTriggerProps,
} from './collapsible.types';

type InjectedCollapsibleProps = {
  __open?: boolean;
  __setOpen?: (open: boolean) => void;
  __disabled?: boolean;
  __contentId?: string;
};

let pendingFocusRestoreId: string | null = null;

function isJsxElement(value: unknown): value is JSXElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    'props' in value
  );
}

function toChildArray(children: unknown): unknown[] {
  if (Array.isArray(children)) {
    return children;
  }

  return children === undefined || children === null ? [] : [children];
}

function serializeForId(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => serializeForId(item)).join('|');
  }

  if (value === undefined || value === null || typeof value === 'boolean') {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (isJsxElement(value)) {
    const typeName =
      typeof value.type === 'string'
        ? value.type
        : typeof value.type === 'function'
          ? value.type.name || 'component'
          : 'component';
    const propEntries = Object.entries(value.props ?? {})
      .filter(
        ([key, entryValue]) =>
          key !== 'children' &&
          key !== 'ref' &&
          !key.startsWith('on') &&
          (typeof entryValue === 'string' ||
            typeof entryValue === 'number' ||
            typeof entryValue === 'boolean')
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${key}:${String(entryValue)}`)
      .join(',');

    return `${typeName}[${propEntries}](${serializeForId(value.props?.children)})`;
  }

  return typeof value;
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function resolveCollapsibleContentId(props: CollapsibleProps): string {
  const identity =
    props.id ??
    `auto-${hashString(
      [
        props.defaultOpen ? 'open' : 'closed',
        props.disabled ? 'disabled' : 'enabled',
        serializeForId(props.children),
      ].join('|')
    )}`;

  return formatId({
    prefix: 'collapsible-content',
    id: identity,
  });
}

function cloneCollapsibleChild(
  child: unknown,
  injected: InjectedCollapsibleProps
): unknown {
  if (
    !isJsxElement(child) ||
    (child.type !== CollapsibleTrigger && child.type !== CollapsibleContent)
  ) {
    return child;
  }

  return {
    ...child,
    props: {
      ...child.props,
      ...injected,
    },
  };
}

function readInjectedState(
  props: InjectedCollapsibleProps
): Required<InjectedCollapsibleProps> {
  if (!props.__setOpen || props.__open === undefined || !props.__contentId) {
    throw new Error('Collapsible components must be used within <Collapsible>');
  }

  return {
    __open: props.__open,
    __setOpen: props.__setOpen,
    __disabled: props.__disabled ?? false,
    __contentId: props.__contentId,
  };
}

export function Collapsible(props: CollapsibleProps) {
  const {
    id,
    children,
    open,
    defaultOpen = false,
    onOpenChange,
    disabled = false,
  } = props;

  const openState = controllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const contentId = resolveCollapsibleContentId({
    id,
    children,
    open,
    defaultOpen,
    onOpenChange,
    disabled,
  });
  const enhancedChildren = toChildArray(children).map((child) =>
    cloneCollapsibleChild(child, {
      __open: openState(),
      __setOpen: openState.set,
      __disabled: disabled,
      __contentId: contentId,
    })
  );

  return <>{enhancedChildren}</>;
}

export function CollapsibleTrigger(props: CollapsibleTriggerProps): JSX.Element;
export function CollapsibleTrigger(
  props: CollapsibleTriggerAsChildProps
): JSX.Element;
export function CollapsibleTrigger(
  props:
    | (CollapsibleTriggerProps & InjectedCollapsibleProps)
    | (CollapsibleTriggerAsChildProps & InjectedCollapsibleProps)
) {
  const {
    asChild,
    children,
    ref,
    __open,
    __setOpen,
    __disabled,
    __contentId,
    ...rest
  } = props;
  const injected = readInjectedState({
    __open,
    __setOpen,
    __disabled,
    __contentId,
  });
  const restoreFocusRef = (node: HTMLElement | null) => {
    if (node && pendingFocusRestoreId === injected.__contentId) {
      pendingFocusRestoreId = null;
      node.focus();
    }
  };
  const toggleOpen = (event?: Event) => {
    if (
      event &&
      'currentTarget' in event &&
      event.currentTarget === document.activeElement
    ) {
      pendingFocusRestoreId = injected.__contentId;
    }
    injected.__setOpen(!injected.__open);
    if (event && 'currentTarget' in event) {
      (event.currentTarget as HTMLElement | null)?.focus?.();
    }
  };
  const interactionProps = pressable({
    disabled: injected.__disabled,
    onPress: (event) => toggleOpen(event as Event),
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
      restoreFocusRef
    ),
    'data-slot': 'collapsible-trigger',
    'aria-expanded': injected.__open ? 'true' : 'false',
    'aria-controls': injected.__contentId,
    'data-state': injected.__open ? 'open' : 'closed',
    'data-disabled': injected.__disabled ? 'true' : undefined,
    onKeyDown: !asChild
      ? (event: KeyboardEvent) => {
          if (event.key === ' ') {
            event.preventDefault();
          }
          if (event.key === 'Enter') {
            toggleOpen(event);
          }
        }
      : undefined,
    onKeyUp: !asChild
      ? (event: KeyboardEvent) => {
          if (event.key === ' ') {
            toggleOpen(event);
          }
        }
      : undefined,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return (
    <button type="button" {...finalProps}>
      {children}
    </button>
  );
}

export function CollapsibleContent(
  props: CollapsibleContentProps
): JSX.Element | null;
export function CollapsibleContent(
  props: CollapsibleContentAsChildProps
): JSX.Element | null;
export function CollapsibleContent(
  props:
    | (CollapsibleContentProps & InjectedCollapsibleProps)
    | (CollapsibleContentAsChildProps & InjectedCollapsibleProps)
) {
  const {
    asChild,
    children,
    forceMount = false,
    ref,
    __open,
    __setOpen,
    __disabled,
    __contentId,
    ...rest
  } = props;
  const injected = readInjectedState({
    __open,
    __setOpen,
    __disabled,
    __contentId,
  });
  const finalProps = mergeProps(rest, {
    ref,
    id: injected.__contentId,
    'data-slot': 'collapsible-content',
    'data-state': injected.__open ? 'open' : 'closed',
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
