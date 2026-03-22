/**
 * WAI-ARIA Separator Pattern.
 */

export const SEPARATOR_A11Y_CONTRACT = {
  ROLE: 'separator' as const,
  DECORATIVE_ROLE: 'presentation' as const,
  ORIENTATION_ATTRIBUTE: 'aria-orientation' as const,
  DATA_ATTRIBUTES: {
    orientation: 'data-orientation' as const,
  },
  DEFAULT_ORIENTATION: 'horizontal' as const,
} as const;

export type SeparatorA11yContract = typeof SEPARATOR_A11Y_CONTRACT;
