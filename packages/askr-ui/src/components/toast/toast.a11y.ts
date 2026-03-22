/**
 * Toast accessibility contract.
 */

export const TOAST_A11Y_CONTRACT = {
  ROOT_ROLE: 'status' as const,
  LIVE_REGION_ATTRIBUTE: 'aria-live' as const,
  LIVE_REGION_VALUE: 'polite' as const,
  VIEWPORT_LABEL: 'Notifications' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
  },
} as const;

export type ToastA11yContract = typeof TOAST_A11Y_CONTRACT;
