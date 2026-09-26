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
import { getRenderedAttributeName } from './element-attributes';
import { parseEventProp } from './events';

export class HydrationCursor {
  private readonly next = new Map<Node, Node | null>();

  constructor(private readonly stopAt: Node | null = null) {}

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
      textNode.splitText(text.length);
    }
    this.advance(container, textNode);
    return textNode;
  }
}

function isInsignificantWhitespace(node: Text): boolean {
  return node.data.trim() === '' && node.data.includes('\n');
}

/**
 * Put `container`'s content in the order `expected`, removing any server
 * node that was not claimed. Nodes after `stopAt` are left alone.
 */
export function syncChildren(
  container: Node,
  expected: readonly Node[],
  stopAt: Node | null = null
): void {
  let cursor = container.firstChild;
  for (const node of expected) {
    if (node === cursor) {
      cursor = cursor.nextSibling;
    } else {
      container.insertBefore(node, cursor);
    }
  }
  while (cursor && cursor !== stopAt) {
    const next = cursor.nextSibling;
    container.removeChild(cursor);
    cursor = next;
  }
}

/** Attribute names `props` renders on `el`. */
function renderedAttributes(el: Element, props: Props): Set<string> {
  const names = new Set<string>();
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
export function removeUnrenderedAttributes(el: Element, props: Props): void {
  const keep = renderedAttributes(el, props);
  for (const attribute of Array.from(el.attributes)) {
    if (!keep.has(attribute.name)) el.removeAttribute(attribute.name);
  }
}
