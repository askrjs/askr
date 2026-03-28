import { Slot, mergeProps } from '@askrjs/askr/foundations';
import {
  isKeyboardModality,
  markKeyboardModality,
  markPointerModality,
} from '../../_internal/focus';
import type { FocusRingAsChildProps, FocusRingProps } from './focus-ring.types';

function updateFocusAttributes(node: EventTarget | null, focused: boolean) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  if (!focused) {
    node.removeAttribute('data-focused');
    node.removeAttribute('data-focus-visible');
    return;
  }

  node.setAttribute('data-focused', 'true');

  if (isKeyboardModality()) {
    node.setAttribute('data-focus-visible', 'true');
  } else {
    node.removeAttribute('data-focus-visible');
  }
}

export function FocusRing(props: FocusRingProps): JSX.Element;
export function FocusRing(props: FocusRingAsChildProps): JSX.Element;
export function FocusRing(props: FocusRingProps | FocusRingAsChildProps) {
  const { asChild, children, ref, ...rest } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'data-focus-ring': 'true',
    onKeyDown: () => {
      markKeyboardModality();
    },
    onPointerDown: () => {
      markPointerModality();
    },
    onFocus: (event: FocusEvent) => {
      updateFocusAttributes(event.currentTarget, true);
    },
    onBlur: (event: FocusEvent) => {
      updateFocusAttributes(event.currentTarget, false);
    },
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
