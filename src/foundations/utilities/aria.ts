/**
 * Tiny aria helpers
 */

export function ariaDisabled(disabled?: boolean): { 'aria-disabled'?: 'true' } {
  return disabled ? { 'aria-disabled': 'true' } : {};
}

export function ariaExpanded(expanded?: boolean): {
  'aria-expanded'?: 'true' | 'false';
} {
  return expanded === undefined
    ? {}
    : { 'aria-expanded': String(expanded) as 'true' | 'false' };
}

export function ariaSelected(selected?: boolean): {
  'aria-selected'?: 'true' | 'false';
} {
  return selected === undefined
    ? {}
    : { 'aria-selected': String(selected) as 'true' | 'false' };
}
