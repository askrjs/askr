export const STACK_A11Y_CONTRACT = {
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    gap: 'data-gap' as const,
    align: 'data-align' as const,
    justify: 'data-justify' as const,
    wrap: 'data-wrap' as const,
  },
  SLOT_VALUES: {
    root: 'stack' as const,
  },
} as const;

export type StackA11yContract = typeof STACK_A11Y_CONTRACT;
