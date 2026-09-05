import {
  DIRECT_RANGE_OWNER,
  type DirectRangeOwner,
  type DOMRange,
} from '../common/dom-range';

export type { DOMRange } from '../common/dom-range';

export const RANGE_START_MARKER = 'askr-range-start';
export const RANGE_END_MARKER = 'askr-range-end';

const rangesByOwner = new WeakMap<object, DOMRange>();
const ownersByAnchor = new WeakMap<Node, object>();
const rangesByAnchor = new WeakMap<Node, DOMRange>();
const hostsByOwner = new WeakMap<object, Node>();

function readOwnerRange(owner: object): DOMRange | undefined {
  return DIRECT_RANGE_OWNER in owner
    ? (owner as DirectRangeOwner).range
    : rangesByOwner.get(owner);
}

function writeOwnerRange(owner: object, range: DOMRange | undefined): void {
  if (DIRECT_RANGE_OWNER in owner) (owner as DirectRangeOwner).range = range;
  else if (range) rangesByOwner.set(owner, range);
  else rangesByOwner.delete(owner);
}

/** Update an alias without transferring the anchors' primary owner. */
export function indexOwnedRange(
  owner: object,
  range: DOMRange | undefined
): void {
  const previous = readOwnerRange(owner);
  if (previous === range) return;
  if (previous) clearRegisteredRange(previous, owner);
  if (range) writeOwnerRange(owner, range);
}

/** Component wrappers share the host range, without transferring its lifetime owner. */
export function indexRangeHostOwner(owner: object, host: Node): void {
  const previous = hostsByOwner.get(owner);
  if (previous && previous !== host) {
    const range = readOwnerRange(owner);
    if (range?.start === previous) clearRangeOwner(range, owner);
  }
  hostsByOwner.set(owner, host);
  const primary = ownersByAnchor.get(host);
  const range = primary ? readOwnerRange(primary) : rangesByAnchor.get(host);
  if (range?.start === host) writeOwnerRange(owner, range);
}

export function clearRangeHostOwner(owner: object, host: Node): void {
  if (hostsByOwner.get(owner) !== host) return;
  hostsByOwner.delete(owner);
  const range = readOwnerRange(owner);
  if (range?.start === host) clearRangeOwner(range, owner);
}

export function releaseOwnerRange(owner: object): void {
  hostsByOwner.delete(owner);
  releaseRegisteredRange(owner);
}

/** A generation can restore its opaque host index after runtime ownership
 * has been restored. Capturing does not expose renderer metadata to callers. */
export function captureOwnerRange(owner: object): () => void {
  const range = getOwnedRange(owner);
  const host = hostsByOwner.get(owner);
  const primary = range ? ownersByAnchor.get(range.start) : undefined;
  return () => {
    releaseOwnerRange(owner);
    if (range) {
      if (primary) registerRange(range, primary);
      if (rangesByAnchor.has(range.start))
        rangesByAnchor.set(range.start, range);
    }
    if (host) indexRangeHostOwner(owner, host);
    if (range) writeOwnerRange(owner, range);
  };
}

export function releaseRegisteredRange(owner: object): void {
  const range = readOwnerRange(owner);
  if (range) clearRegisteredRange(range, owner);
}

function isRangeMarker(node: Node): node is Comment {
  return node.nodeType === 8;
}

function normalizeNodes(node: Node | DocumentFragment | null): Node[] {
  if (!node) {
    return [];
  }

  return node instanceof DocumentFragment
    ? Array.from(node.childNodes)
    : [node];
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
  owner?: object,
  forceAnchors = false,
  preserveExistingOwner = false
): { range: DOMRange; fragment: DocumentFragment | null } {
  if (nodes instanceof DocumentFragment) {
    const first = nodes.firstChild;
    const last = nodes.lastChild;
    const existingOwner = first ? getRangeOwner(first) : undefined;
    const existingRange = existingOwner
      ? getOwnedRange(existingOwner)
      : undefined;
    if (
      existingRange &&
      !existingRange.single &&
      existingRange.start === first &&
      existingRange.end === last
    ) {
      if (owner && !preserveExistingOwner) registerRange(existingRange, owner);
      return { range: existingRange, fragment: nodes };
    }
  }

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

  if (normalized.length === 1 && !forceAnchors) {
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
  return createDetachedRange(ownerDocument.createDocumentFragment(), owner);
}

export function registerRange(range: DOMRange, owner?: object): void {
  // Only shared component hosts need this lazy lookup index. Ordinary keyed
  // scopes already retain their registered range and do not allocate an alias.
  if (rangesByAnchor.has(range.start)) rangesByAnchor.set(range.start, range);
  if (!owner) {
    return;
  }

  const previous = readOwnerRange(owner);
  if (previous && previous !== range) clearRangeOwner(previous, owner);

  const previousStartOwner = ownersByAnchor.get(range.start);
  const previousEndOwner = ownersByAnchor.get(range.end);
  for (const previousOwner of [previousStartOwner, previousEndOwner]) {
    const previousRange = previousOwner
      ? readOwnerRange(previousOwner)
      : undefined;
    if (
      previousOwner &&
      previousOwner !== owner &&
      previousRange &&
      (previousRange.start === range.start || previousRange.end === range.end)
    ) {
      writeOwnerRange(previousOwner, undefined);
    }
  }

  writeOwnerRange(owner, range);
  ownersByAnchor.set(range.start, owner);
  if (range.end !== range.start) {
    ownersByAnchor.set(range.end, owner);
  }
  const host = range.start as Node & {
    __ASKR_INSTANCES?: object[];
    __ASKR_INSTANCE?: object;
  };
  for (const shared of host.__ASKR_INSTANCES ?? []) {
    if (hostsByOwner.get(shared) === range.start)
      writeOwnerRange(shared, range);
  }
  const primary = host.__ASKR_INSTANCE;
  if (
    primary &&
    primary !== host.__ASKR_INSTANCES?.[0] &&
    hostsByOwner.get(primary) === range.start
  )
    writeOwnerRange(primary, range);
}

export function getOwnedRange(owner: object): DOMRange | undefined {
  const owned = readOwnerRange(owner);
  if (owned) return owned;
  const host = hostsByOwner.get(owner);
  if (!host) return undefined;
  const primary = ownersByAnchor.get(host);
  const registered = primary ? readOwnerRange(primary) : undefined;
  if (registered?.start === host) {
    writeOwnerRange(owner, registered);
    return registered;
  }
  const range = rangesByAnchor.get(host);
  if (range?.start === host) return range;
  if (isRangeStart(host)) {
    const end = findRangeEnd(host);
    if (end) {
      const anchored = { start: host, end, single: false };
      rangesByAnchor.set(host, anchored);
      return anchored;
    }
  }
  const singleton = createSingleNodeRange(host);
  rangesByAnchor.set(host, singleton);
  return singleton;
}

export function getRangeOwner(node: Node): object | undefined {
  return ownersByAnchor.get(node);
}

export function setRangeOwner(range: DOMRange, owner: object): void {
  registerRange(range, owner);
}

function clearRegisteredRange(range: DOMRange, owner: object): void {
  writeOwnerRange(owner, undefined);
  if (ownersByAnchor.get(range.start) === owner)
    ownersByAnchor.delete(range.start);
  if (range.end !== range.start && ownersByAnchor.get(range.end) === owner)
    ownersByAnchor.delete(range.end);
}

export function clearRangeOwner(range: DOMRange, owner?: object): void {
  if (owner) {
    if (readOwnerRange(owner) === range) clearRegisteredRange(range, owner);
    return;
  }
  const startOwner = ownersByAnchor.get(range.start);
  const endOwner =
    range.end === range.start ? startOwner : ownersByAnchor.get(range.end);
  if (startOwner && readOwnerRange(startOwner) === range)
    clearRegisteredRange(range, startOwner);
  if (endOwner && endOwner !== startOwner && readOwnerRange(endOwner) === range)
    clearRegisteredRange(range, endOwner);
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

function containsActiveElement(range: DOMRange, parent: Node): boolean {
  let child = parent.ownerDocument?.activeElement as Node | null | undefined;
  if (!child || !parent.contains(child)) return false;
  while (child.parentNode && child.parentNode !== parent)
    child = child.parentNode;
  return child.parentNode === parent && rangeContains(range, child);
}

export function captureRangeFocus(range: DOMRange, parent: Node): () => void {
  const active = parent.ownerDocument?.activeElement;
  if (
    typeof HTMLElement === 'undefined' ||
    !(active instanceof HTMLElement) ||
    !containsActiveElement(range, parent)
  ) {
    return () => {};
  }

  const selection =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? {
          start: active.selectionStart,
          end: active.selectionEnd,
          direction: active.selectionDirection,
        }
      : null;

  return () => {
    if (!active.isConnected || active.ownerDocument.activeElement === active) {
      return;
    }

    try {
      active.focus({ preventScroll: true });
    } catch {
      active.focus();
    }
    if (
      selection &&
      (active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement) &&
      selection.start !== null &&
      selection.end !== null
    ) {
      active.setSelectionRange(
        selection.start,
        selection.end,
        selection.direction ?? undefined
      );
    }
  };
}

export function moveRange(
  parent: Node,
  range: DOMRange,
  before: Node | null = null
): boolean {
  if (
    range.start.parentNode === parent &&
    range.end.parentNode === parent &&
    range.end.nextSibling === before
  ) {
    return false;
  }

  if (before && rangeContains(range, before)) {
    return false;
  }

  const retainedFocusedRange =
    range.start.parentNode === parent && containsActiveElement(range, parent);
  const restoreFocus = retainedFocusedRange
    ? () => undefined
    : captureRangeFocus(range, parent);
  if (range.single || retainedFocusedRange) {
    appendRange(parent, range, before);
  } else {
    const fragment = parent.ownerDocument!.createDocumentFragment();
    appendRange(fragment, range);
    parent.insertBefore(fragment, before);
  }
  restoreFocus();
  return true;
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
  removeNode: (node: Node) => void = (node) =>
    node.parentNode?.removeChild(node)
): void {
  if (range.single) {
    removeNode(range.start);
  } else {
    const nodes = [range.start, ...getRangeNodes(range), range.end];
    for (const node of nodes) {
      removeNode(node);
    }
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

export function isRangeStart(node: Node): node is Comment {
  return isRangeMarker(node) && node.data === RANGE_START_MARKER;
}

export function isRangeEnd(node: Node): node is Comment {
  return isRangeMarker(node) && node.data === RANGE_END_MARKER;
}

export function findRangeEnd(start: Node): Node | null {
  if (!isRangeStart(start)) return null;
  let depth = 0;
  for (
    let current: Node | null = start;
    current;
    current = current.nextSibling
  ) {
    if (isRangeStart(current)) depth++;
    if (isRangeEnd(current)) {
      depth--;
      if (depth === 0) return current;
    }
  }
  return null;
}

/**
 * Return direct logical children without exposing the interior of an
 * anchor-backed range to its parent's sibling reconciler.
 */
export function getLogicalChildHosts(parent: Node): Node[] {
  const hosts: Node[] = [];
  let current: Node | null = parent.firstChild;

  while (current) {
    hosts.push(current);
    if (isRangeStart(current)) {
      const end = findRangeEnd(current);
      if (end?.parentNode === parent) {
        current = end.nextSibling;
        continue;
      }
    }
    current = current.nextSibling;
  }

  return hosts;
}

export function findRangeAtNode(node: Node): DOMRange | null {
  const owner = getRangeOwner(node);
  if (owner) {
    return getOwnedRange(owner) ?? null;
  }

  for (
    let current: Node | null = node;
    current;
    current = current.previousSibling
  ) {
    if (!isRangeStart(current)) continue;
    const end = findRangeEnd(current);
    if (end && rangeContains({ start: current, end, single: false }, node)) {
      return { start: current, end, single: false };
    }
  }
  return null;
}
