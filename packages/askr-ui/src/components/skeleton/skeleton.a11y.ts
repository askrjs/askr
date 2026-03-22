/**
 * Accessibility contract for Skeleton.
 */

export const SKELETON_A11Y_CONTRACT = {
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
  },
  MARKER: 'data-skeleton' as const,
  DECORATIVE_ATTRIBUTE: 'aria-hidden' as const,
  DECORATIVE_VALUE: 'true' as const,
} as const;

export type SkeletonA11yContract = typeof SKELETON_A11Y_CONTRACT;
