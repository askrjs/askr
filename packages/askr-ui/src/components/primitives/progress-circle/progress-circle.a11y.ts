/**
 * WAI-ARIA progressbar contract for circular progress.
 */

export const PROGRESS_CIRCLE_A11Y_CONTRACT = {
  ROLE: 'progressbar' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    percentage: 'data-percentage' as const,
  },
  VALUE_NOW_ATTRIBUTE: 'aria-valuenow' as const,
  VALUE_MIN_ATTRIBUTE: 'aria-valuemin' as const,
  VALUE_MAX_ATTRIBUTE: 'aria-valuemax' as const,
  INDICATOR_MARKER: 'data-progress-circle-indicator' as const,
} as const;

export type ProgressCircleA11yContract = typeof PROGRESS_CIRCLE_A11Y_CONTRACT;
