export const INLINE_A11Y_CONTRACT = {
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    gap: 'data-gap' as const,
    align: 'data-align' as const,
    justify: 'data-justify' as const,
    wrap: 'data-wrap' as const,
    collapseBelow: 'data-collapse-below' as const,
  },
  SLOT_VALUES: {
    root: 'inline' as const,
  },
} as const;

export type InlineA11yContract = typeof INLINE_A11Y_CONTRACT;
