/**
 * Focus scope accessibility contract.
 */

export const FOCUS_SCOPE_A11Y_CONTRACT = {
  FEATURES: {
    trapped: true,
    loop: true,
    restoreFocus: true,
  },
} as const;

export type FocusScopeA11yContract = typeof FOCUS_SCOPE_A11Y_CONTRACT;
