import { logger } from '../dev/logger';
import { Fragment, cloneElement, isElement, ELEMENT_TYPE } from '../jsx';
import type { JSXElement } from '../jsx';

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

export function Slot(props: SlotProps): JSXElement | null {
  if (props.asChild) {
    const { children, ...rest } = props;

    if (isElement(children)) {
      return cloneElement(children, rest);
    }

    logger.warn('<Slot asChild> expects a single JSX element child.');

    return null;
  }

  // Structural no-op: Slot does not introduce DOM
  // Return a vnode object for the fragment with the internal element marker.
  return {
    $$typeof: ELEMENT_TYPE,
    type: Fragment,
    props: { children: props.children },
  } as JSXElement;
}
