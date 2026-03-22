export const CENTER_A11Y_CONTRACT = {
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    axis: 'data-axis' as const,
    inline: 'data-inline' as const,
    minHeight: 'data-min-height' as const,
  },
  SLOT_VALUES: {
    root: 'center' as const,
  },
} as const;

export type CenterA11yContract = typeof CENTER_A11Y_CONTRACT;
