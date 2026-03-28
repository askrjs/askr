/**
 * Dismissable layer accessibility contract.
 */

export const DISMISSABLE_LAYER_A11Y_CONTRACT = {
  DISMISS_EVENTS: ['escape-key', 'outside-pointer'] as const,
  INTERACTION_POLICY: 'background-dismissable' as const,
} as const;

export type DismissableLayerA11yContract =
  typeof DISMISSABLE_LAYER_A11Y_CONTRACT;
