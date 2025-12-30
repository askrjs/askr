/**
 * Tiny aria helpers
 */

export function ariaDisabled(disabled?: boolean) {
  return disabled ? { 'aria-disabled': 'true' } : {};
}

export function ariaExpanded(expanded?: boolean) {
  return { 'aria-expanded': String(Boolean(expanded)) };
}

export function ariaSelected(selected?: boolean) {
  return { 'aria-selected': String(Boolean(selected)) };
}
