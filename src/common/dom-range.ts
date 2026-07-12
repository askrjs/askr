/**
 * Internal DOM range shape shared by runtime ownership records and the
 * renderer. A singleton range uses the node itself for both anchors; a
 * multi-node or empty range uses deterministic comment anchors.
 */
export interface DOMRange {
  start: Node;
  end: Node;
  single: boolean;
}
