import { ELEMENT_TYPE, Fragment } from '../../jsx';
import type { JSXElement } from '../../jsx';
import type { RenderableChild } from '../../common/vnode';

export interface PresenceProps {
  present: boolean | (() => boolean);
  children?: RenderableChild;
}

/**
 * Presence
 *
 * Structural policy primitive for conditional mount/unmount.
 * - No timers
 * - No animation coupling
 * - No DOM side-effects
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Present as Function
 *    Accepts boolean OR function to support lazy evaluation patterns.
 *    Function is called once per render. Use boolean form for static values.
 *
 * 2. Children Type
 *    Presence forwards normal renderable child content only.
 *    Imperative DOM nodes are not part of the public contract.
 *
 * 3. Immediate Mount/Unmount
 *    No exit animations or transitions. When `present` becomes false,
 *    children are removed immediately. Animation must be layered above
 *    this primitive.
 */
export function Presence({
  present,
  children,
}: PresenceProps): JSXElement | null {
  const isPresent =
    typeof present === 'function' ? present() : Boolean(present);
  if (!isPresent) return null;

  const element: JSXElement = {
    $$typeof: ELEMENT_TYPE,
    type: Fragment,
    props: { children },
    key: null,
  };
  return element;
}
