/**
 * Tooltip accessibility contract.
 */

export const TOOLTIP_A11Y_CONTRACT = {
  CONTENT_ROLE: 'tooltip' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
    side: 'data-side' as const,
    align: 'data-align' as const,
  },
  TRIGGER_ATTRIBUTE: 'aria-describedby' as const,
  OPEN_STATE_ATTRIBUTE: 'data-state' as const,
} as const;

export type TooltipA11yContract = typeof TOOLTIP_A11Y_CONTRACT;
