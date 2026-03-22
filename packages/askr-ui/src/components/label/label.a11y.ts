/**
 * Native label semantics for askr-ui Label.
 */

export const LABEL_A11Y_CONTRACT = {
  ELEMENT: 'label' as const,
  ASSOCIATION_ATTRIBUTE: 'for' as const,
  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
  },
  NAME_SOURCE_PRIORITY: ['aria-label', 'textContent'] as const,
  AS_CHILD: {
    forwardsProps: true,
    preservesChildElement: true,
  },
} as const;

export type LabelA11yContract = typeof LABEL_A11Y_CONTRACT;
