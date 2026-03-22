/**
 * WAI-ARIA Radio Group Pattern
 *
 * Specification: https://www.w3.org/WAI/ARIA/apg/patterns/radio/
 */

export const RADIO_GROUP_A11Y_CONTRACT = {
  GROUP_ROLE: 'radiogroup' as const,
  ITEM_ROLE: 'radio' as const,
  CHECKED_ATTRIBUTE: 'aria-checked' as const,
  ORIENTATION_ATTRIBUTE: 'aria-orientation' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
    orientation: 'data-orientation' as const,
  },
  KEYBOARD_NAVIGATION: [
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
  ] as const,
  ROVING_FOCUS: {
    activeItemTabIndex: 0,
    inactiveItemTabIndex: -1,
  },
  FORM_INTEGRATION: {
    hiddenInputType: 'hidden' as const,
  },
} as const;

export type RadioGroupA11yContract = typeof RADIO_GROUP_A11Y_CONTRACT;
