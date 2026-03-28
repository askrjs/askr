export const SPACER_A11Y_CONTRACT = {
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    axis: 'data-axis' as const,
    grow: 'data-grow' as const,
    shrink: 'data-shrink' as const,
    basis: 'data-basis' as const,
  },
  SLOT_VALUES: {
    root: 'spacer' as const,
  },
} as const;

export type SpacerA11yContract = typeof SPACER_A11Y_CONTRACT;
