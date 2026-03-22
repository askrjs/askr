export const GRID_A11Y_CONTRACT = {
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    columns: 'data-columns' as const,
    minItemWidth: 'data-min-item-width' as const,
    gap: 'data-gap' as const,
    autoFit: 'data-auto-fit' as const,
    align: 'data-align' as const,
    justify: 'data-justify' as const,
  },
  SLOT_VALUES: {
    root: 'grid' as const,
  },
} as const;

export type GridA11yContract = typeof GRID_A11Y_CONTRACT;
