/**
 * Native textarea semantics wrapped by askr-ui Textarea.
 */

export const TEXTAREA_A11Y_CONTRACT = {
  HOST_ELEMENT: 'textarea' as const,
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

export type TextareaA11yContract = typeof TEXTAREA_A11Y_CONTRACT;
