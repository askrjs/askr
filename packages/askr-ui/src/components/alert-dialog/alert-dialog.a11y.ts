/**
 * Alert dialog accessibility contract.
 */

export const ALERT_DIALOG_A11Y_CONTRACT = {
  CONTENT_ROLE: 'alertdialog' as const,
  LABELLED_BY_ATTRIBUTE: 'aria-labelledby' as const,
  DESCRIBED_BY_ATTRIBUTE: 'aria-describedby' as const,
  ACTION_REQUIREMENTS: {
    hasPrimaryAction: true,
    hasCancelAction: true,
  },
} as const;

export type AlertDialogA11yContract = typeof ALERT_DIALOG_A11Y_CONTRACT;
