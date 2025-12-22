import { logger } from '../dev/logger';
import { Fragment, cloneElement, isElement } from '../jsx';

export type SlotProps =
  | {
      asChild: true;
      children: unknown;
      [key: string]: unknown;
    }
  | {
      asChild?: false;
      children?: unknown;
    };

export function Slot(props: SlotProps) {
  if (props.asChild) {
    const { children, ...rest } = props;

    if (isElement(children)) {
      return cloneElement(children, rest);
    }

    logger.warn('<Slot asChild> expects a single JSX element child.');

    return null;
  }

  // Structural no-op: Slot does not introduce DOM
  // Return a vnode object for the fragment to avoid using JSX in a .ts file.
  return { type: Fragment, props: { children: props.children } } as unknown;
}
