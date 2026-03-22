/**
 * Slider accessibility contract.
 */

export const SLIDER_A11Y_CONTRACT = {
  THUMB_ROLE: 'slider' as const,
  VALUE_NOW_ATTRIBUTE: 'aria-valuenow' as const,
  VALUE_MIN_ATTRIBUTE: 'aria-valuemin' as const,
  VALUE_MAX_ATTRIBUTE: 'aria-valuemax' as const,
  ORIENTATION_ATTRIBUTE: 'aria-orientation' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    disabled: 'data-disabled' as const,
    orientation: 'data-orientation' as const,
  },
} as const;

export type SliderA11yContract = typeof SLIDER_A11Y_CONTRACT;
