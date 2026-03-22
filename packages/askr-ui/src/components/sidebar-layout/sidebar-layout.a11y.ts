export const SIDEBAR_LAYOUT_A11Y_CONTRACT = {
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    sidebarPosition: 'data-sidebar-position' as const,
    sidebarWidth: 'data-sidebar-width' as const,
    gap: 'data-gap' as const,
    collapseBelow: 'data-collapse-below' as const,
  },
  SLOT_VALUES: {
    root: 'sidebar-layout' as const,
    sidebar: 'sidebar' as const,
    main: 'main' as const,
  },
} as const;

export type SidebarLayoutA11yContract = typeof SIDEBAR_LAYOUT_A11Y_CONTRACT;
