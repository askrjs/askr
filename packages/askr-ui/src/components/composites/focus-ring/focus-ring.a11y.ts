/**
 * Focus ring accessibility contract.
 */

export const FOCUS_RING_A11Y_CONTRACT = {
  PURPOSE: 'visible-focus-indicator' as const,
  APPLIES_TO: 'focusable-child' as const,
} as const;

export type FocusRingA11yContract = typeof FOCUS_RING_A11Y_CONTRACT;
