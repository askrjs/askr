/**
 * WAI-ARIA Switch Pattern
 *
 * Specification: https://www.w3.org/WAI/ARIA/apg/patterns/switch/
 */

export const SWITCH_A11Y_CONTRACT = {
  ROLE: 'switch' as const,
  CHECKED_ATTRIBUTE: 'aria-checked' as const,
  KEYBOARD_ACTIVATION: ['Enter', 'Space'] as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
  },
  DISABLED_ATTRIBUTES: {
    nativeButton: {
      disabled: true,
      'aria-disabled': 'true' as const,
    },
    nonNative: {
      'aria-disabled': 'true' as const,
      tabIndex: -1,
    },
  },
  FORM_INTEGRATION: {
    host: 'button' as const,
    hiddenInputType: 'checkbox' as const,
    hiddenInputValue: 'on' as const,
  },
} as const;

export type SwitchA11yContract = typeof SWITCH_A11Y_CONTRACT;
