/**
 * focusable
 *
 * Normalize focus-related props for hosts.
 * - No DOM manipulation here; returns props that the runtime may attach.
 */

export interface FocusableOptions {
  disabled?: boolean;
  tabIndex?: number | undefined;
}

export interface FocusableResult {
  tabIndex?: number;
  'aria-disabled'?: 'true';
}

export function focusable({
  disabled,
  tabIndex,
}: FocusableOptions): FocusableResult {
  return {
    tabIndex: disabled ? -1 : tabIndex === undefined ? 0 : tabIndex,
    ...(disabled ? { 'aria-disabled': 'true' } : {}),
  };
}
