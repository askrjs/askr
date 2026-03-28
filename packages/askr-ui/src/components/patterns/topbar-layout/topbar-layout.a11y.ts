export const TOPBAR_LAYOUT_A11Y_CONTRACT = {
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    topbarHeight: 'data-topbar-height' as const,
    gap: 'data-gap' as const,
  },
  SLOT_VALUES: {
    root: 'topbar-layout' as const,
    navbar: 'navbar' as const,
    main: 'main' as const,
  },
} as const;

export type TopbarLayoutA11yContract = typeof TOPBAR_LAYOUT_A11Y_CONTRACT;
