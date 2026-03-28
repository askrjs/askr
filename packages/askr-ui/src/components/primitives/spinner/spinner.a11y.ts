/**
 * Accessibility contract for Spinner.
 */

export const SPINNER_A11Y_CONTRACT = {
  ROLE: 'progressbar' as const,
  VALUE_TEXT_ATTRIBUTE: 'aria-valuetext' as const,
} as const;

export type SpinnerA11yContract = typeof SPINNER_A11Y_CONTRACT;
