/**
 * focusable
 *
 * Normalize focus-related props for hosts.
 * - No DOM manipulation here; returns props that the runtime may attach.
 */

import { ariaDisabled } from '../utilities/aria';

/** Options for {@link focusable}. */
export interface FocusableOptions {
  disabled?: boolean;
  tabIndex?: number | undefined;
}

/** Element props returned by {@link focusable}. */
export interface FocusableResult {
  tabIndex?: number;
  'aria-disabled'?: 'true';
}

/** Normalize `tabIndex`/`aria-disabled` props for a focusable host. */
export function focusable({
  disabled,
  tabIndex,
}: FocusableOptions): FocusableResult {
  return {
    tabIndex: disabled ? -1 : tabIndex === undefined ? 0 : tabIndex,
    ...ariaDisabled(disabled),
  };
}
