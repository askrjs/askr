/**
 * Shared types exposed to consumers
 */

/**
 * Props accepted by components and elements. This is intentionally permissive
 * but gives a single named type to tighten and document over time.
 */
export interface Props {
  /** Optional key for keyed lists (string | number | symbol for internal frames) */
  key?: string | number | symbol;
  /** Optional children slot */
  children?: unknown;
  /** Allow additional arbitrary attributes (e.g., className, id, data-*) */
  [attr: string]: unknown;
}

export interface ComponentNode {
  type: 'component' | 'element' | 'text';
  value?: unknown;
  children?: ComponentNode[];
}
