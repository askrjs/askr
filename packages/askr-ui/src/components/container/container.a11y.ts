export const CONTAINER_A11Y_CONTRACT = {
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    maxWidth: 'data-max-width' as const,
    padding: 'data-padding' as const,
    centered: 'data-centered' as const,
    fluid: 'data-fluid' as const,
    size: 'data-size' as const,
  },
  SLOT_VALUES: {
    root: 'container' as const,
  },
} as const;

export type ContainerA11yContract = typeof CONTAINER_A11Y_CONTRACT;
