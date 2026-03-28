/**
 * Native input semantics wrapped by askr-ui Input.
 */

export const INPUT_A11Y_CONTRACT = {
  HOST_ELEMENT: 'input' as const,
  DISABLED_ATTRIBUTES: {
    native: 'disabled' as const,
    asChild: 'aria-disabled' as const,
  },
  DATA_ATTRIBUTES: {
    disabled: 'data-disabled' as const,
  },
  FOCUS_RULES: {
    defaultTabIndex: 0,
    disabledTabIndex: -1,
  },
  LABELING: {
    supportsLabelElement: true,
    supportsAriaLabel: true,
    supportsAriaLabelledBy: true,
  },
} as const;

export type InputA11yContract = typeof INPUT_A11Y_CONTRACT;
