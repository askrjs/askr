/**
 * Visually hidden content accessibility contract.
 */

export const VISUALLY_HIDDEN_A11Y_CONTRACT = {
  STRATEGY: 'visually-hidden-but-screen-reader-visible' as const,
  HOST_ELEMENT: 'span' as const,
} as const;

export type VisuallyHiddenA11yContract = typeof VISUALLY_HIDDEN_A11Y_CONTRACT;
