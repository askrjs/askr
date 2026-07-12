import type { DOMRange } from '../common/dom-range';

export type { DOMRange } from '../common/dom-range';

export const RANGE_START_MARKER = 'askr-range-start';
export const RANGE_END_MARKER = 'askr-range-end';

const rangesByOwner = new WeakMap<object, DOMRange>();
const ownersByAnchor = new WeakMap<Node, object>();

function isRangeMarker(node: Node): node is Comment {
  return node.nodeType === 8;
}

function normalizeNodes(node: Node | DocumentFragment | null): Node[] {
  if (!node) {
    return [];
  }

  return node instanceof DocumentFragment ? Array.from(node.childNodes) : [node];
}

export function getRangeNodes(range: DOMRange): Node[] {
  if (range.single) {
    return range.start.parentNode ? [range.start] : [];
  }

  const nodes: Node[] = [];
  let current = range.start.nextSibling;
  while (current && current !== range.end) {
    nodes.push(current);
    current = current.nextSibling;
  }
  return nodes;
}

export function getRangeFirstNode(range: DOMRange): Node | null {
  return range.single ? range.start : range.start.nextSibling;
}

export function getRangeLastNode(range: DOMRange): Node | null {
  return range.single ? range.end : range.end.previousSibling;
}

export function getRangeParent(range: DOMRange): Node | null {
  return range.start.parentNode;
}

export function getRangeBeforeNode(range: DOMRange): Node | null {
  return range.start;
}

export function createDetachedRange(
  nodes: Node | DocumentFragment | null,
  owner?: object
): { range: DOMRange; fragment: DocumentFragment | null } {
  if (nodes && !(nodes instanceof DocumentFragment)) {
    return { range: createSingleNodeRange(nodes, owner), fragment: null };
  }

  const normalized = normalizeNodes(nodes);
  const ownerDocument =
    normalized[0]?.ownerDocument ??
    (typeof document !== 'undefined' ? document : null);
  if (!ownerDocument) {
    throw new Error('[askr] Cannot create a DOM range without a document.');
  }

  if (normalized.length === 1) {
    const single = normalized[0]!;
    return { range: createSingleNodeRange(single, owner), fragment: null };
  }

  const fragment = ownerDocument.createDocumentFragment();
  const start = ownerDocument.createComment(RANGE_START_MARKER);
  const end = ownerDocument.createComment(RANGE_END_MARKER);
  fragment.appendChild(start);
  for (const node of normalized) {
    fragment.appendChild(node);
  }
  fragment.appendChild(end);
  const range: DOMRange = { start, end, single: false };
  registerRange(range, owner);
  return { range, fragment };
}

/** @internal Create the common singleton range without a result wrapper. */
export function createSingleNodeRange(node: Node, owner?: object): DOMRange {
  const range: DOMRange = { start: node, end: node, single: true };
  registerRange(range, owner);
  return range;
}

export function createEmptyRange(
  ownerDocument: Document = document,
  owner?: object
): { range: DOMRange; fragment: DocumentFragment | null } {
  return createDetachedRange(
    ownerDocument.createDocumentFragment(),
    owner
  );
}

export function registerRange(range: DOMRange, owner?: object): void {
  if (!owner) {
    return;
  }

  rangesByOwner.set(owner, range);
  ownersByAnchor.set(range.start, owner);
  if (range.end !== range.start) {
    ownersByAnchor.set(range.end, owner);
  }
}

export function getOwnedRange(owner: object): DOMRange | undefined {
  return rangesByOwner.get(owner);
}

export function getRangeOwner(node: Node): object | undefined {
  return ownersByAnchor.get(node);
}

export function setRangeOwner(range: DOMRange, owner: object): void {
  registerRange(range, owner);
}

export function clearRangeOwner(range: DOMRange, owner?: object): void {
  const startOwner = ownersByAnchor.get(range.start);
  const endOwner = ownersByAnchor.get(range.end);
  if (!owner || startOwner === owner) {
    ownersByAnchor.delete(range.start);
  }
  if (!owner || endOwner === owner) {
    ownersByAnchor.delete(range.end);
  }
  if (!owner || rangesByOwner.get(owner) === range) {
    rangesByOwner.delete(owner ?? (startOwner as object));
  }
}

export function appendRange(
  parent: Node,
  range: DOMRange,
  before: Node | null = null
): void {
  if (range.single) {
    parent.insertBefore(range.start, before);
    return;
  }

  const nodes = [range.start, ...getRangeNodes(range), range.end];
  for (const node of nodes) {
    parent.insertBefore(node, before);
  }
}

export function moveRange(
  parent: Node,
  range: DOMRange,
  before: Node | null = null
): void {
  if (before && rangeContains(range, before)) {
    return;
  }

  if (range.single) {
    parent.insertBefore(range.start, before);
    return;
  }

  const fragment = parent.ownerDocument!.createDocumentFragment();
  const nodes = [range.start, ...getRangeNodes(range), range.end];
  for (const node of nodes) {
    fragment.appendChild(node);
  }
  parent.insertBefore(fragment, before);
}

export function insertRangeBefore(
  parent: Node,
  range: DOMRange,
  before: Node | null = null
): void {
  moveRange(parent, range, before);
}

export function forEachRangeNode(
  range: DOMRange,
  visit: (node: Node) => void,
  includeMarkers = false
): void {
  if (includeMarkers && !range.single) {
    visit(range.start);
  }
  for (const node of getRangeNodes(range)) {
    visit(node);
  }
  if (includeMarkers && !range.single) {
    visit(range.end);
  }
}

export function removeRange(
  range: DOMRange,
  removeNode: (node: Node) => void = (node) => node.parentNode?.removeChild(node)
): void {
  if (range.single) {
    removeNode(range.start);
    clearRangeOwner(range);
    return;
  }

  const nodes = [range.start, ...getRangeNodes(range), range.end];
  for (const node of nodes) {
    removeNode(node);
  }
  clearRangeOwner(range);
}

export function replaceRange(
  previous: DOMRange,
  next: DOMRange,
  before?: Node | null
): void {
  const parent = previous.start.parentNode;
  if (!parent) {
    return;
  }

  const anchor = before ?? previous.start;
  insertRangeBefore(parent, next, anchor);
  removeRange(previous);
}

export function rangeContains(range: DOMRange, node: Node): boolean {
  if (range.single) {
    return range.start === node;
  }
  if (range.start.parentNode !== node.parentNode) {
    return false;
  }
  let current: Node | null = range.start;
  while (current) {
    if (current === node) return true;
    if (current === range.end) break;
    current = current.nextSibling;
  }
  return false;
}

export function isRangeStart(node: Node): boolean {
  return isRangeMarker(node) && node.data === RANGE_START_MARKER;
}

export function isRangeEnd(node: Node): boolean {
  return isRangeMarker(node) && node.data === RANGE_END_MARKER;
}

export function findRangeEnd(start: Node): Node | null {
  if (!isRangeStart(start)) return null;
  let depth = 0;
  for (let current: Node | null = start; current; current = current.nextSibling) {
    if (isRangeStart(current)) depth++;
    if (isRangeEnd(current)) {
      depth--;
      if (depth === 0) return current;
    }
  }
  return null;
}

export function findRangeAtNode(node: Node): DOMRange | null {
  const owner = getRangeOwner(node);
  if (owner) {
    return getOwnedRange(owner) ?? null;
  }

  for (let current: Node | null = node; current; current = current.previousSibling) {
    if (!isRangeStart(current)) continue;
    const end = findRangeEnd(current);
    if (end && rangeContains({ start: current, end, single: false }, node)) {
      return { start: current, end, single: false };
    }
  }
  return null;
}
