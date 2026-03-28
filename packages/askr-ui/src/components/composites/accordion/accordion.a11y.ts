/**
 * WAI-ARIA accordion/disclosure contract.
 */

export const ACCORDION_A11Y_CONTRACT = {
  TRIGGER_ROLE: 'button' as const,
  EXPANDED_ATTRIBUTE: 'aria-expanded' as const,
  CONTROLS_ATTRIBUTE: 'aria-controls' as const,
  PANEL_ROLE: 'region' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
    orientation: 'data-orientation' as const,
  },
} as const;

export type AccordionA11yContract = typeof ACCORDION_A11Y_CONTRACT;
