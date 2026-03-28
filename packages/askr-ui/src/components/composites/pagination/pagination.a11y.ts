/**
 * Pagination accessibility contract.
 */

export const PAGINATION_A11Y_CONTRACT = {
  NAV_ROLE: 'navigation' as const,
  CURRENT_PAGE_ATTRIBUTE: 'aria-current' as const,
  CURRENT_PAGE_VALUE: 'page' as const,
  NEXT_LABEL: 'Next page' as const,
  PREV_LABEL: 'Previous page' as const,
  ELLIPSIS_MARKER: 'data-pagination-ellipsis' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
  },
} as const;

export type PaginationA11yContract = typeof PAGINATION_A11Y_CONTRACT;
