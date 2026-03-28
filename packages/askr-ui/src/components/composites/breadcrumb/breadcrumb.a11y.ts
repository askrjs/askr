/**
 * Breadcrumb accessibility contract.
 */

export const BREADCRUMB_A11Y_CONTRACT = {
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
  },
  NAV_ROLE: 'navigation' as const,
  CURRENT_PAGE_ATTRIBUTE: 'aria-current' as const,
  CURRENT_PAGE_VALUE: 'page' as const,
  SEPARATOR_MARKER: 'data-breadcrumb-separator' as const,
} as const;

export type BreadcrumbA11yContract = typeof BREADCRUMB_A11Y_CONTRACT;
