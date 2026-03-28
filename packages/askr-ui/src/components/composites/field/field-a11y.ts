/**
 * Accessibility contract for composed Field primitives.
 */

export const FIELD_A11Y_CONTRACT = {
  CONTROL_ID_SUFFIX: '-control' as const,
  DESCRIPTION_ID_SUFFIX: '-description' as const,
  ERROR_ID_SUFFIX: '-error' as const,
  DATA_ATTRIBUTES: {
    invalid: 'data-invalid' as const,
    required: 'data-required' as const,
    disabled: 'data-disabled' as const,
  },
  LABEL_ASSOCIATION_ATTRIBUTE: 'for' as const,
  DESCRIPTION_ATTRIBUTE: 'aria-describedby' as const,
  INVALID_ATTRIBUTE: 'aria-invalid' as const,
  REQUIRED_ATTRIBUTE: 'aria-required' as const,
  DISABLED_ATTRIBUTE: 'aria-disabled' as const,
  ERROR_ROLE: 'alert' as const,
} as const;

export type FieldA11yContract = typeof FIELD_A11Y_CONTRACT;
