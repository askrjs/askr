/**
 * Hydration: rendering over server markup with a cursor.
 *
 * While a root's first render hydrates, each container element has a cursor
 * at its next unclaimed child. Creating a text or element node first tries to
 * claim the node under the cursor: an element with the same tag, or a text
 * node (split when the server merged adjacent texts). A node that does not
 * match is created fresh instead. When a container's children are rendered,
 * one commit operation puts the claimed and created nodes in order and
 * removes whatever the server rendered that the client did not.
 */

import {
  isSkippedProp,
  keepsFalseValue,
} from '../../common/prop-classification';
import type { Props } from '../../common/props';
import { ATTRIBUTE_PROP_PREFIX } from '../../common/dom-properties';
import { isSSRPortalHydrationAnchor } from '../../common/portal';
import { getRenderedAttributeName } from './element-attributes';
import { parseEventProp } from './events';
import type { Pass } from './pass';
import { CommitMutationError } from './pass';

export interface DeferredHydration {
  readonly render: () => void;
}

export class HydrationCursor {
  private readonly next = new Map<Node, Node | null>();
  /** Renders to run after the root's hydrating render (portal hosts). */
  readonly deferred: DeferredHydration[] = [];

  constructor(private readonly stopAt: Node | null = null) {}

  /** Server nodes reserved for a portal host whose writer has not hydrated. */
  heldNodes(container: Node): Node[] {
    if (!this.stopAt) return [];
    const nodes: Node[] = [];
    let node = this.next.has(container)
      ? this.next.get(container)!
      : container.firstChild;
    while (node && node !== this.stopAt) {
      if (node.nodeType !== 8) nodes.push(node);
      node = node.nextSibling;
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
      node = node.nextSibling;
    }
    if (node && isRangeMarker(node, 'askr-range-start')) {
      let depth = 0;
      let end: Node | null = node;
      for (; end && end !== this.stopAt; end = end.nextSibling) {
        if (isRangeMarker(end, 'askr-range-start')) depth++;
        else if (isRangeMarker(end, 'askr-range-end') && --depth === 0) break;
      }
      if (end && end !== this.stopAt) {
        this.next.set(container, end.nextSibling);
        const inner = new HydrationCursor(end);
        inner.next.set(container, node.nextSibling);
        return inner;
      }
    }
    const later = new HydrationCursor(this.stopAt);
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
      node = node.nextSibling;
    }
    return node === this.stopAt ? null : node;
  }

  private advance(container: Node, node: Node): void {
    this.next.set(container, node.nextSibling);
  }

  claimElement(
    container: Node,
    tag: string,
    namespace: string | null
  ): Element | null {
    const node = this.peek(container);
    if (!node || node.nodeType !== 1) return null;
    const el = node as Element;
    const expectedNs = namespace ?? 'http://www.w3.org/1999/xhtml';
    if (el.localName !== tag.toLowerCase() && el.localName !== tag) return null;
    if ((el.namespaceURI ?? expectedNs) !== expectedNs) return null;
    this.advance(container, el);
    return el;
  }

  /**
   * Claim a text node for `text`. A server text that begins with `text` is
   * split so the remainder stays claimable by the next text; any other
   * server text is claimed and corrected at commit.
   */
  claimText(container: Node, text: string): Text | null {
    const node = this.peek(container);
    if (!node || node.nodeType !== 3) return null;
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
      this.next.set(container, remainder);
      return textNode;
    }
    this.advance(container, textNode);
    return textNode;
  }
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
  stopAt: Node | null = null
): void {
  const previous = Array.from(container.childNodes);
  pass.onReversibleCommit(() => restoreChildren(container, previous));

  try {
    // SSR portal anchors stay where the server put them.
    const skipAnchors = (node: Node | null): Node | null => {
      while (node && node !== stopAt && isSSRPortalHydrationAnchor(node)) {
        node = node.nextSibling;
      }
      return node;
    };
    let cursor = skipAnchors(container.firstChild);
    for (const node of expected) {
      if (node === cursor) {
        cursor = skipAnchors(cursor.nextSibling);
      } else {
        container.insertBefore(node, cursor);
      }
    }
    while (cursor && cursor !== stopAt) {
      const next = cursor.nextSibling;
      if (!isSSRPortalHydrationAnchor(cursor)) container.removeChild(cursor);
      cursor = next;
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

/**
 * Server attributes the client does not render are removed from an adopted
 * element, so a mismatched attribute does not survive hydration.
 */
export function removeUnrenderedAttributes(
  el: Element,
  props: Props,
  beforeRemove?: (attributes: readonly Attr[]) => void
): void {
  const keep = renderedAttributes(el, props);
  const removed = Array.from(el.attributes).filter(
    (attribute) => !keep.has(attribute.name)
  );
  beforeRemove?.(removed);
  for (const attribute of removed) el.removeAttribute(attribute.name);
}
