/**
 * Common call contracts: Props
 *
 * This file holds structural types shared across multiple modules.
 */

/**
 * Props accepted by components and elements.
 * Intentionally permissive but provides a single named type.
 */
export interface Props {
  /** Optional key for keyed lists (string | number | symbol for internal frames) */
  key?: string | number | symbol;
  /** Optional children slot */
  children?: unknown;
  /** Allow additional arbitrary attributes (e.g., class, id, data-*) */
  [attr: string]: unknown;
}

export interface ComponentNode {
  type: 'component' | 'element' | 'text';
  value?: unknown;
  children?: ComponentNode[];
}
