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

/** Native records expose one renderer-maintained range index. Extension
 * objects remain opaque and use the renderer's external index instead. */
export const DIRECT_RANGE_OWNER = Symbol('askr.directRangeOwner');

export interface DirectRangeOwner {
  readonly [DIRECT_RANGE_OWNER]: true;
  range: DOMRange | undefined;
}
