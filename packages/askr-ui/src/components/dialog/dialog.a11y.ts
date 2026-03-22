/**
 * Dialog accessibility contract.
 */

export const DIALOG_A11Y_CONTRACT = {
  CONTENT_ROLE: 'dialog' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
  },
  MODAL_ATTRIBUTE: 'aria-modal' as const,
  LABELLED_BY_ATTRIBUTE: 'aria-labelledby' as const,
  DESCRIBED_BY_ATTRIBUTE: 'aria-describedby' as const,
  TRIGGER_ATTRIBUTES: {
    expanded: 'aria-expanded' as const,
    controls: 'aria-controls' as const,
  },
} as const;

export type DialogA11yContract = typeof DIALOG_A11Y_CONTRACT;
