import { Fragment, cloneElement, isElement, ELEMENT_TYPE } from '../../jsx';
import type { JSXElement } from '../../jsx';

export type SlotProps =
  | {
      asChild: true;
      children: JSXElement;
      [key: string]: unknown;
    }
  | {
      asChild?: false;
      children?: unknown;
    };

/**
 * Slot
 *
 * Structural primitive for prop forwarding patterns.
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. asChild Pattern
 *    When asChild=true, merges props into the single child element.
 *    Child must be a valid JSXElement; non-element children return null.
 *
 * 2. Fallback Behavior
 *    When asChild=false, returns a Fragment (structural no-op).
 *    No DOM element is introduced.
 *
 * 3. Type Safety
 *    asChild=true requires exactly one JSXElement child (enforced by type).
 *    Runtime validates with isElement() check.
 */
export function Slot(props: SlotProps): JSXElement | null {
  if (props.asChild) {
    const { children, asChild: _asChild, ...rest } = props;

    if (isElement(children)) {
      return cloneElement(children, rest);
    }
    return null;
  }

  // Structural no-op: Slot does not introduce DOM
  // Return a vnode object for the fragment with the internal element marker.
  const element: JSXElement = {
    $$typeof: ELEMENT_TYPE,
    type: Fragment,
    props: { children: props.children },
    key: null,
  };
  return element;
}
