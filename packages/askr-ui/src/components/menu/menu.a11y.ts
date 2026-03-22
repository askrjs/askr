/**
 * Menu accessibility contract.
 */

export const MENU_A11Y_CONTRACT = {
  CONTENT_ROLE: 'menu' as const,
  ITEM_ROLE: 'menuitem' as const,
  ORIENTATION_ATTRIBUTE: 'aria-orientation' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    disabled: 'data-disabled' as const,
    orientation: 'data-orientation' as const,
  },
} as const;

export type MenuA11yContract = typeof MENU_A11Y_CONTRACT;
