/**
 * Hydration: rendering over server markup with a cursor.
 *
 * While a root's first render hydrates, each container element has a cursor
 * at its next unclaimed child. Creating a text or element node first tries to
 * claim the node under the cursor: an element with the same tag, or a text
 * node (split when the server merged adjacent texts). A node that does not
 * match is created fresh instead. When a container's children are rendered,
 * one commit operation puts the claimed and created nodes in order and
 * removes whatever the server rendered that the client did not. Attributes the
 * client never mentions stay on adopted elements (outside verify mode).
 */

import {
  isSkippedProp,
  keepsFalseValue,
} from '../../common/prop-classification';
import type { Props } from '../../common/props';
import {
  describeNode,
  describeText,
  domPath,
  type HydrationMismatchInfo,
} from '../../common/dom-path';
import { ATTRIBUTE_PROP_PREFIX } from '../../common/dom-properties';
import { isSSRPortalHydrationAnchor } from '../../common/portal';
import { RENDERER_BOOKKEEPING_ATTRS } from '../../common/hydration-bookkeeping';
import { getRenderedAttributeName } from './element-attributes';
import { parseEventProp } from './events';
import type { Pass } from './pass';
import { CommitMutationError } from './pass';

export interface HydrationOptions {
  /** Verify mode: adopted elements lose every attribute the client omits. */
  readonly strict: boolean;
  /** Told about each server node that does not match what the client renders. */
  readonly onMismatch?: (info: HydrationMismatchInfo) => void;
  /** Server nodes already reported, so one mismatch is reported once. */
  readonly reported?: WeakSet<Node>;
  /** Mismatch paths start below this node (the application root). */
  readonly root?: Node;
}

export const DEFAULT_HYDRATION_OPTIONS: HydrationOptions = { strict: false };

export interface DeferredHydration {
  readonly render: () => void;
}

export class HydrationCursor {
  private readonly next = new Map<Node, Node | null>();
  /** Per container: the server node each upcoming claim should take. */
  private readonly plans = new Map<Node, Array<Node | null | undefined>>();
  /** Renders to run after the root's hydrating render (portal hosts). */
  readonly deferred: DeferredHydration[] = [];

  constructor(
    private readonly stopAt: Node | null = null,
    private readonly successors = new WeakMap<Node, Node | null>(),
    readonly options: HydrationOptions = DEFAULT_HYDRATION_OPTIONS
  ) {}

  get strict(): boolean {
    return this.options.strict;
  }

  /** Report a server node hydration removes because the client rendered nothing there. */
  reportRemoved(node: Node): void {
    if (
      node.nodeType === 1 ||
      (node.nodeType === 3 && !isInsignificantWhitespace(node as Text))
    ) {
      this.mismatch(node.parentNode ?? node, node, 'nothing');
    }
  }

  /** Report the server node at the cursor that the client does not render. */
  private mismatch(container: Node, node: Node | null, expected: string): void {
    const { onMismatch, reported } = this.options;
    if (!onMismatch || !node || reported?.has(node)) return;
    reported?.add(node);
    onMismatch({
      path: domPath(node, this.options.root ?? null),
      expected,
      actual: describeNode(node),
    });
  }

  /** Detached text suffixes retain the server sibling that follows them. */
  private followingSibling(node: Node): Node | null {
    return this.successors.has(node)
      ? this.successors.get(node)!
      : node.nextSibling;
  }

  /** Consume private SSR metadata emitted immediately before a component output. */
  claimResourceSlots(container: Node): string[] | null {
    let node = this.next.has(container)
      ? this.next.get(container)!
      : container.firstChild;
    for (; node && node !== this.stopAt; node = this.followingSibling(node)) {
      if (node.nodeType === 3 && isInsignificantWhitespace(node as Text)) {
        continue;
      }
      if (node.nodeType !== 8) return null;
      const match = /^askr-resource:(r:\d+(?:,r:\d+)*)$/.exec(
        (node as Comment).data
      );
      if (match) {
        this.advance(container, node);
        return match[1]!.split(',');
      }
      // Range comments delimit reserved portal output, so they belong to the
      // cursor protocol and must not be skipped by resource metadata lookup.
      if (
        isRangeMarker(node, 'askr-range-start') ||
        isRangeMarker(node, 'askr-range-end')
      ) {
        return null;
      }
    }
    return null;
  }

  /** Server nodes reserved for a portal host whose writer has not hydrated. */
  heldNodes(container: Node): Node[] {
    if (!this.stopAt) return [];
    const nodes: Node[] = [];
    let node = this.next.has(container)
      ? this.next.get(container)!
      : container.firstChild;
    while (node && node !== this.stopAt) {
      if (node.nodeType !== 8) nodes.push(node);
      node = this.followingSibling(node);
    }
    return nodes;
  }

  /**
   * Reserve the server nodes at `container`'s cursor for a render that runs
   * later. A server range (`askr-range-start` ... `askr-range-end`) is skipped
   * as a whole; the returned cursor claims inside it, or from the reserved
   * position onward when there is no range.
   */
  reserve(container: Node): HydrationCursor {
    let node = this.next.has(container)
      ? this.next.get(container)!
      : container.firstChild;
    while (
      node &&
      node !== this.stopAt &&
      node.nodeType === 3 &&
      isInsignificantWhitespace(node as Text)
    ) {
      node = this.followingSibling(node);
    }
    if (node && isRangeMarker(node, 'askr-range-start')) {
      let depth = 0;
      let end: Node | null = node;
      for (; end && end !== this.stopAt; end = this.followingSibling(end)) {
        if (isRangeMarker(end, 'askr-range-start')) depth++;
        else if (isRangeMarker(end, 'askr-range-end') && --depth === 0) break;
      }
      if (end && end !== this.stopAt) {
        this.next.set(container, this.followingSibling(end));
        const inner = new HydrationCursor(end, this.successors, this.options);
        inner.next.set(container, this.followingSibling(node));
        return inner;
      }
    }
    const later = new HydrationCursor(
      this.stopAt,
      this.successors,
      this.options
    );
    later.next.set(container, node);
    return later;
  }

  private peek(container: Node): Node | null {
    let node = this.next.has(container)
      ? this.next.get(container)!
      : container.firstChild;
    // Comments and whitespace between server nodes carry no content.
    while (
      node &&
      node !== this.stopAt &&
      (node.nodeType === 8 ||
        (node.nodeType === 3 && isInsignificantWhitespace(node as Text)))
    ) {
      node = this.followingSibling(node);
    }
    return node === this.stopAt ? null : node;
  }

  /**
   * Follow the plan for `container`: false when the next client node has no
   * server counterpart, otherwise move the cursor to the planned server node.
   */
  private takePlanned(container: Node): boolean {
    const plan = this.plans.get(container);
    if (!plan) return true;
    const step = plan.shift();
    if (plan.length === 0) this.plans.delete(container);
    if (step === null) return false;
    if (step !== undefined) this.next.set(container, step);
    return true;
  }

  /**
   * Match the client's `expected` child list against the server nodes at
   * `container`'s cursor, so an extra node on either side costs only itself.
   * `expected` holds an element's tag and namespace, or `null` for a text.
   * Without a plan the cursor claims greedily, node by node.
   */
  plan(
    container: Node,
    expected: ReadonlyArray<{ tag: string; ns: string | null } | null>
  ): void {
    const server: Node[] = [];
    let node = this.peek(container);
    while (node && node !== this.stopAt) {
      if (node.nodeType === 1 || node.nodeType === 3) server.push(node);
      node = this.followingSibling(node);
      while (
        node &&
        node !== this.stopAt &&
        (node.nodeType === 8 ||
          (node.nodeType === 3 && isInsignificantWhitespace(node as Text)))
      ) {
        node = this.followingSibling(node);
      }
    }
    // Adjacent client texts are one server text node.
    const tokens: Array<{ tag: string; ns: string | null } | null> = [];
    const owner: number[] = [];
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] === null && i > 0 && expected[i - 1] === null) {
        owner.push(tokens.length - 1);
        continue;
      }
      owner.push(tokens.length);
      tokens.push(expected[i]);
    }
    const matched = alignChildren(tokens, server);
    if (!matched) return;
    const plan: Array<Node | null | undefined> = [];
    for (let i = 0; i < expected.length; i++) {
      const token = owner[i];
      const target = matched[token];
      const continuation = i > 0 && owner[i - 1] === token;
      plan.push(continuation ? (target === null ? null : undefined) : target);
    }
    this.plans.set(container, plan);
  }

  private advance(container: Node, node: Node): void {
    this.next.set(container, this.followingSibling(node));
  }

  claimElement(
    container: Node,
    tag: string,
    namespace: string | null
  ): Element | null {
    const planned = this.takePlanned(container);
    const node = this.peek(container);
    if (!planned || !node || node.nodeType !== 1) {
      this.mismatch(container, node, `<${tag}>`);
      return null;
    }
    const el = node as Element;
    if (!isElementMatch(el, tag, namespace)) {
      this.mismatch(container, node, `<${tag}>`);
      return null;
    }
    this.advance(container, el);
    return el;
  }

  /**
   * Claim a text node for `text`. A server text that begins with `text` is
   * split so the remainder stays claimable by the next text; any other
   * server text is claimed and corrected at commit.
   */
  claimText(container: Node, text: string): Text | null {
    const planned = this.takePlanned(container);
    const node = this.peek(container);
    if (!planned || !node || node.nodeType !== 3) {
      if (text !== '') this.mismatch(container, node, describeText(text));
      return null;
    }
    const textNode = node as Text;
    if (
      text.length > 0 &&
      textNode.data.length > text.length &&
      textNode.data.startsWith(text)
    ) {
      // The adopted node is live DOM. Keep the unclaimed suffix detached so
      // a discarded render never changes the server tree; syncChildren places
      // it only when the hydration pass commits.
      const remainder = document.createTextNode(
        textNode.data.slice(text.length)
      );
      this.successors.set(remainder, this.followingSibling(textNode));
      this.next.set(container, remainder);
      return textNode;
    }
    this.advance(container, textNode);
    return textNode;
  }
}

function isElementMatch(
  el: Element,
  tag: string,
  namespace: string | null
): boolean {
  const expectedNs = namespace ?? 'http://www.w3.org/1999/xhtml';
  const matchesTag =
    expectedNs === 'http://www.w3.org/1999/xhtml'
      ? el.localName === tag.toLowerCase()
      : el.localName === tag;
  return matchesTag && (el.namespaceURI ?? expectedNs) === expectedNs;
}

function tokenMatches(
  token: { tag: string; ns: string | null } | null,
  node: Node
): boolean {
  return token === null
    ? node.nodeType === 3
    : node.nodeType === 1 &&
        isElementMatch(node as Element, token.tag, token.ns);
}

/** Largest table the alignment will fill (cells). */
const MAX_ALIGNMENT_CELLS = 250_000;

/**
 * Pair client tokens with server nodes by a longest common subsequence after
 * trimming the common prefix and suffix. Returns, per token, its server node
 * or `null`; or `undefined` when the lists are too large to align.
 */
function alignChildren(
  tokens: ReadonlyArray<{ tag: string; ns: string | null } | null>,
  server: readonly Node[]
): Array<Node | null> | undefined {
  const result: Array<Node | null> = Array.from(
    { length: tokens.length },
    () => null
  );
  let start = 0;
  while (
    start < tokens.length &&
    start < server.length &&
    tokenMatches(tokens[start], server[start])
  ) {
    result[start] = server[start];
    start++;
  }
  let endT = tokens.length;
  let endS = server.length;
  while (
    endT > start &&
    endS > start &&
    tokenMatches(tokens[endT - 1], server[endS - 1])
  ) {
    result[endT - 1] = server[endS - 1];
    endT--;
    endS--;
  }
  const n = endT - start;
  const m = endS - start;
  if (n === 0 || m === 0) return result;
  if ((n + 1) * (m + 1) > MAX_ALIGNMENT_CELLS) return undefined;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = tokenMatches(tokens[start + i], server[start + j])
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (
      tokenMatches(tokens[start + i], server[start + j]) &&
      table[i * width + j] === table[(i + 1) * width + j + 1] + 1
    ) {
      result[start + i] = server[start + j];
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return result;
}

function isRangeMarker(node: Node, data: string): boolean {
  return node.nodeType === 8 && (node as Comment).data === data;
}

function isInsignificantWhitespace(node: Text): boolean {
  return node.data.trim() === '' && node.data.includes('\n');
}

/**
 * Put `container`'s content in the order `expected`, removing any server
 * node that was not claimed. Nodes after `stopAt` are left alone.
 */
export function syncChildren(
  pass: Pass,
  container: Node,
  expected: readonly Node[],
  stopAt: Node | null = null,
  cursor?: HydrationCursor
): void {
  // SSR portal anchors stay where the server put them. Hydration normally
  // claims nodes in their existing order, so avoid copying every container's
  // children into an undo snapshot when no DOM write is needed.
  const skipAnchors = (node: Node | null): Node | null => {
    while (node && node !== stopAt && isSSRPortalHydrationAnchor(node)) {
      node = node.nextSibling;
    }
    return node;
  };
  let at = skipAnchors(container.firstChild);
  let alreadySynchronized = true;
  for (const node of expected) {
    if (node !== at) {
      alreadySynchronized = false;
      break;
    }
    at = skipAnchors(node.nextSibling);
  }
  if (alreadySynchronized && (!at || at === stopAt)) return;

  const previous = Array.from(container.childNodes);
  pass.onReversibleCommit(() => restoreChildren(container, previous));

  try {
    at = skipAnchors(container.firstChild);
    for (const node of expected) {
      if (node === at) {
        at = skipAnchors(at.nextSibling);
      } else {
        container.insertBefore(node, at);
      }
    }
    while (at && at !== stopAt) {
      const next = at.nextSibling;
      if (!isSSRPortalHydrationAnchor(at)) {
        cursor?.reportRemoved(at);
        container.removeChild(at);
      }
      at = next;
    }
  } catch (error) {
    throw new CommitMutationError(error);
  }
}

function restoreChildren(container: Node, previous: readonly Node[]): void {
  for (let index = 0; index < previous.length; index++) {
    const current = container.childNodes[index] ?? null;
    if (current !== previous[index]) {
      container.insertBefore(previous[index], current);
    }
  }
  while (container.childNodes.length > previous.length) {
    container.removeChild(container.lastChild!);
  }
}

/** Attribute names `props` renders on `el`. */
function renderedAttributes(el: Element, props: Props): Set<string> {
  const names = new Set<string>();
  if (el.localName === 'option') {
    const parent = el.parentElement;
    const select =
      parent?.localName === 'optgroup' ? parent.parentElement : parent;
    if (select?.localName === 'select' && select.hasAttribute('value')) {
      names.add('selected');
    }
  }
  for (const key in props) {
    if (isSkippedProp(key) || parseEventProp(key)) continue;
    const value = props[key];
    if (typeof value !== 'function') {
      if (value === null || value === undefined) continue;
      if (value === false && !keepsFalseValue(key)) continue;
    }
    if (key === 'className') {
      names.add('class');
      continue;
    }
    const name = key.startsWith(ATTRIBUTE_PROP_PREFIX)
      ? key.slice(ATTRIBUTE_PROP_PREFIX.length)
      : key;
    names.add(getRenderedAttributeName(el, name));
  }
  return names;
}

/** Attribute names for props the client names but does not render. */
function retiredAttributes(el: Element, props: Props): Set<string> {
  const names = new Set<string>();
  for (const key in props) {
    if (isSkippedProp(key) || parseEventProp(key)) continue;
    const value = props[key];
    if (typeof value === 'function') continue;
    if (value !== null && value !== undefined) {
      if (value !== false || keepsFalseValue(key)) continue;
    }
    if (key === 'className') {
      names.add('class');
      continue;
    }
    const name = key.startsWith(ATTRIBUTE_PROP_PREFIX)
      ? key.slice(ATTRIBUTE_PROP_PREFIX.length)
      : key;
    names.add(getRenderedAttributeName(el, name));
  }
  return names;
}

/**
 * Remove server attributes from an adopted element. Attributes the client
 * never mentions (a theme attribute, a browser extension's marker) stay; the
 * renderers' own bookkeeping goes, and so does an attribute the client names
 * with an empty value. Verify mode (`strict`) removes everything the client
 * does not render, so a mismatched attribute is visible.
 */
export function removeUnrenderedAttributes(
  el: Element,
  props: Props,
  strict: boolean,
  beforeRemove?: (attributes: readonly Attr[]) => void
): void {
  let removed: Attr[];
  if (strict) {
    const keep = renderedAttributes(el, props);
    removed = Array.from(el.attributes).filter(
      (attribute) => !keep.has(attribute.name)
    );
  } else {
    const retired = retiredAttributes(el, props);
    const rendered = renderedAttributes(el, props);
    removed = Array.from(el.attributes).filter(
      (attribute) =>
        (RENDERER_BOOKKEEPING_ATTRS.includes(attribute.name) &&
          !rendered.has(attribute.name)) ||
        retired.has(attribute.name)
    );
  }
  beforeRemove?.(removed);
  for (const attribute of removed) el.removeAttribute(attribute.name);
}
