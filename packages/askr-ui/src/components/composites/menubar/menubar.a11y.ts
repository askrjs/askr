/**
 * WAI-ARIA menubar contract.
 */

export const MENUBAR_A11Y_CONTRACT = {
  ROOT_ROLE: 'menubar' as const,
  CONTENT_ROLE: 'menu' as const,
  ITEM_ROLE: 'menuitem' as const,
  EXPANDED_ATTRIBUTE: 'aria-expanded' as const,
  HAS_POPUP_ATTRIBUTE: 'aria-haspopup' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
    side: 'data-side' as const,
    align: 'data-align' as const,
  },
} as const;

export type MenubarA11yContract = typeof MENUBAR_A11Y_CONTRACT;
