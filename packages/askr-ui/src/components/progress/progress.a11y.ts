/**
 * WAI-ARIA progressbar contract for linear progress.
 */

export const PROGRESS_A11Y_CONTRACT = {
  ROLE: 'progressbar' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    percentage: 'data-percentage' as const,
  },
  VALUE_NOW_ATTRIBUTE: 'aria-valuenow' as const,
  VALUE_MIN_ATTRIBUTE: 'aria-valuemin' as const,
  VALUE_MAX_ATTRIBUTE: 'aria-valuemax' as const,
  INDICATOR_MARKER: 'data-progress-indicator' as const,
  INDICATOR_PERCENTAGE_ATTRIBUTE: 'data-percentage' as const,
} as const;

export type ProgressA11yContract = typeof PROGRESS_A11Y_CONTRACT;
