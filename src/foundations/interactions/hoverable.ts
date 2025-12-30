/**
 * hoverable
 *
 * Produces props for pointer enter/leave handling. Pure and deterministic.
 */

export interface HoverableOptions {
  disabled?: boolean;
  onEnter?: (e: HoverEvent) => void;
  onLeave?: (e: HoverEvent) => void;
}

import type {
  DefaultPreventable,
  PropagationStoppable,
} from '../utilities/eventTypes';

type HoverEvent = DefaultPreventable & PropagationStoppable;

export interface HoverableResult {
  onPointerEnter?: (e: HoverEvent) => void;
  onPointerLeave?: (e: HoverEvent) => void;
}

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
