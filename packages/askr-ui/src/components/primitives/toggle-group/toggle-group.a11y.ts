/**
 * Accessibility contract for toggle groups.
 */

export const TOGGLE_GROUP_A11Y_CONTRACT = {
  GROUP_ROLE: 'group' as const,
  ITEM_ROLE: 'button' as const,
  PRESSED_ATTRIBUTE: 'aria-pressed' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
    orientation: 'data-orientation' as const,
  },
} as const;

export type ToggleGroupA11yContract = typeof TOGGLE_GROUP_A11Y_CONTRACT;
