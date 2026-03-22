import { Slot, composeRefs, mergeProps } from '@askrjs/askr/foundations';
import {
  focusFirstDescendant,
  getFocusableElements,
  markKeyboardModality,
} from '../_internal/focus';
import { resolveCompoundId } from '../_internal/id';
import type {
  FocusScopeAsChildProps,
  FocusScopeProps,
} from './focus-scope.types';

type ScopeEntry = {
  node: HTMLElement | null;
  previousFocused: HTMLElement | null;
};

const scopeEntries = new Map<string, ScopeEntry>();

function getScopeEntry(scopeId: string): ScopeEntry {
  const existing = scopeEntries.get(scopeId);

  if (existing) {
    return existing;
  }

  const created: ScopeEntry = {
    node: null,
    previousFocused: null,
  };
  scopeEntries.set(scopeId, created);
  return created;
}

export function FocusScope(props: FocusScopeProps): JSX.Element;
export function FocusScope(props: FocusScopeAsChildProps): JSX.Element;
export function FocusScope(props: FocusScopeProps | FocusScopeAsChildProps) {
  const {
    asChild,
    children,
    trapped = false,
    loop = false,
    restoreFocus = true,
    id,
    ref,
    tabIndex,
    ...rest
  } = props;

  const scopeId = resolveCompoundId('focus-scope', id, children);
  const scopeEntry = getScopeEntry(scopeId);

  const setNode = (node: HTMLElement | null) => {
    if (node) {
      scopeEntry.node = node;
      scopeEntry.previousFocused =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (
        !(
          document.activeElement instanceof HTMLElement &&
          node.contains(document.activeElement)
        )
      ) {
        if (!focusFirstDescendant(node)) {
          node.focus();
        }
      }
      return;
    }

    scopeEntry.node = null;

    if (restoreFocus) {
      scopeEntry.previousFocused?.focus?.();
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') {
      return;
    }

    markKeyboardModality();

    const node = scopeEntry.node;

    if (!node) {
      return;
    }

    const focusableElements = getFocusableElements(node);

    if (focusableElements.length === 0) {
      if (trapped) {
        event.preventDefault();
        node.focus();
      }
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const active =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (event.shiftKey) {
      if (active === first || (trapped && active && !node.contains(active))) {
        event.preventDefault();
        if (loop || trapped) {
          (loop ? last : first).focus();
        }
      }
      return;
    }

    if (active === last || (trapped && active && !node.contains(active))) {
      event.preventDefault();
      if (loop || trapped) {
        (loop ? first : last).focus();
      }
    }
  };

  const handleFocusOut = (event: FocusEvent) => {
    if (!trapped) {
      return;
    }

    const node = scopeEntry.node;

    if (!node) {
      return;
    }

    const relatedTarget =
      event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;

    if (relatedTarget && node.contains(relatedTarget)) {
      return;
    }

    if (!focusFirstDescendant(node)) {
      node.focus();
    }
  };

  const finalProps = mergeProps(rest, {
    ref: composeRefs(
      ref as
        | ((value: HTMLElement | null) => void)
        | { current: HTMLElement | null }
        | null
        | undefined,
      setNode
    ),
    tabIndex: asChild ? tabIndex : (tabIndex ?? -1),
    'data-focus-scope': 'true',
    onKeyDown: handleKeyDown,
    onFocusOut: handleFocusOut,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
