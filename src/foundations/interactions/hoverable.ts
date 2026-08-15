/**
 * hoverable
 *
 * Produces props for pointer enter/leave handling. Pure and deterministic.
 */

/** Options for {@link hoverable}. */
export interface HoverableOptions {
  disabled?: boolean;
  onEnter?: (e: HoverEvent) => void;
  onLeave?: (e: HoverEvent) => void;
}

import type {
  DefaultPreventable,
  PropagationStoppable,
} from '../utilities/event-types';

type HoverEvent = DefaultPreventable & PropagationStoppable;

/** Element props returned by {@link hoverable}. */
export interface HoverableResult {
  onPointerEnter?: (e: HoverEvent) => void;
  onPointerLeave?: (e: HoverEvent) => void;
}

/** Produce pointer enter/leave props that call `onEnter`/`onLeave` unless disabled. */
export function hoverable({
  disabled,
  onEnter,
  onLeave,
}: HoverableOptions): HoverableResult {
  return {
    onPointerEnter: disabled
      ? undefined
      : (e) => {
          onEnter?.(e);
        },
    onPointerLeave: disabled
      ? undefined
      : (e) => {
          onLeave?.(e);
        },
  };
}
