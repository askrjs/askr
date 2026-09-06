import type { DOMRange } from '../../common/dom-range';
import { teardownNodeSubtree } from '../ownership/cleanup';
import { removeRange } from '../ownership/ranges';

export function teardownBoundaryRangeNode(node: Node): void {
  // Range anchors can own transparent or null components. Teardown is cheap
  // for metadata-free anchors, so every removed node follows one owner path.
  teardownNodeSubtree(node);
  node.parentNode?.removeChild(node);
}

export function removeBoundaryRange(range: DOMRange): void {
  removeRange(range, teardownBoundaryRangeNode);
}
