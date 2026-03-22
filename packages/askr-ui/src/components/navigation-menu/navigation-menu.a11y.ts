/**
 * Accessibility contract for navigation menu primitives.
 */

export const NAVIGATION_MENU_A11Y_CONTRACT = {
  ROOT_ROLE: 'navigation' as const,
  TRIGGER_ROLE: 'button' as const,
  CONTENT_ROLE: 'dialog' as const,
  VIEWPORT_MARKER: 'data-navigation-menu-viewport' as const,
  INDICATOR_MARKER: 'data-navigation-menu-indicator' as const,
  EXPANDED_ATTRIBUTE: 'aria-expanded' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
    side: 'data-side' as const,
    align: 'data-align' as const,
  },
} as const;

export type NavigationMenuA11yContract = typeof NAVIGATION_MENU_A11Y_CONTRACT;
