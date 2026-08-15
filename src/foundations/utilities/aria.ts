/**
 * Tiny aria helpers
 */

/** Build an `aria-disabled` prop object; omitted entirely when `disabled` is falsy. */
export function ariaDisabled(disabled?: boolean): { 'aria-disabled'?: 'true' } {
  return disabled ? { 'aria-disabled': 'true' } : {};
}

/** Build an `aria-expanded` prop object; omitted when `expanded` is `undefined`. */
export function ariaExpanded(expanded?: boolean): {
  'aria-expanded'?: 'true' | 'false';
} {
  return expanded === undefined
    ? {}
    : { 'aria-expanded': String(expanded) as 'true' | 'false' };
}

/** Build an `aria-selected` prop object; omitted when `selected` is `undefined`. */
export function ariaSelected(selected?: boolean): {
  'aria-selected'?: 'true' | 'false';
} {
  return selected === undefined
    ? {}
    : { 'aria-selected': String(selected) as 'true' | 'false' };
}
