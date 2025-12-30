/**
 * hoverable
 *
 * Produces props for pointer enter/leave handling. Pure and deterministic.
 */

export interface HoverableOptions {
  disabled?: boolean;
  onEnter?: (e: Event) => void;
  onLeave?: (e: Event) => void;
}

export interface HoverableResult {
  onPointerEnter?: (e: Event) => void;
  onPointerLeave?: (e: Event) => void;
}

export function hoverable({ disabled, onEnter, onLeave }: HoverableOptions): HoverableResult {
  return {
    onPointerEnter: disabled
      ? undefined
      : (e: Event) => {
          onEnter?.(e);
        },
    onPointerLeave: disabled
      ? undefined
      : (e: Event) => {
          onLeave?.(e);
        },
  };
}
